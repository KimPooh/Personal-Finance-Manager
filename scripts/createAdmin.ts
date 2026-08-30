import { readFileSync } from "node:fs";
import readline from "node:readline";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { parseEnv } from "node:util";
import { createInitialAdmin } from "@/lib/adminSetup";

// 운영 관리자(AppUser) 계정을 1회 생성하는 대화형 CLI. 공개 HTTP 라우트가 아니라
// 소유자가 자신의 터미널에서 직접 실행하는 운영 도구다.
//
// 실행 방법: npm run create-admin (내부적으로 `node --import tsx scripts/createAdmin.ts`)
//
// 중요: `node --env-file=...`는 쓰지 않는다 - 부모 셸에 이미 같은 이름의 환경변수가
// 있으면 --env-file이 그 값을 덮어쓰지 않는다는 것을 직접 실행해 확인했다
// (`DATABASE_URL=dev-shell-값 node --env-file=prod.env -e "..."`를 실행하면
// dev-shell 값이 그대로 살아남는다). 로컬 개발 중 셸에 dev DB용 DATABASE_URL이
// 남아있는 상태로 이 스크립트를 실행하면 --env-file로는 조용히 잘못된(dev) DB에
// 관리자 계정을 만들 위험이 있다. 그래서 이 스크립트는 process.env.DATABASE_URL을
// 절대 참조하지 않고, .env.production.local 파일을 node:fs로 직접 읽어 node:util의
// parseEnv()로 파싱한 값만 신뢰한다.
//
// 자격증명은 CLI 인자로 절대 받지 않는다(셸 히스토리에 남는 걸 방지) - DATABASE_URL은
// .env.production.local(gitignore 대상)에서만, 아이디/비밀번호는 이 스크립트의 대화형
// 프롬프트에서만 받는다. 성공/실패 메시지 어디에도 아이디·비밀번호·연결 문자열을
// 출력하지 않는다.

const ENV_FILE_PATH = ".env.production.local";
const ALLOWED_PROTOCOLS = new Set(["postgresql:", "postgres:"]);

const HELP_TEXT = `사용법: npm run create-admin

운영 DB에 관리자(AppUser) 계정을 1회 생성하는 대화형 CLI입니다.

사전 준비:
  1. ${ENV_FILE_PATH} 파일(gitignore 대상)에 운영 DATABASE_URL을 설정하세요.
  2. npm run create-admin 으로 실행하세요.
  3. 완료 후 ${ENV_FILE_PATH} 파일을 즉시 삭제하세요.

주의: 셸에 이미 다른 DATABASE_URL이 설정되어 있어도 이 스크립트는 그 값을 절대
참조하지 않습니다 - 오직 ${ENV_FILE_PATH} 파일 내용만 사용합니다.

옵션:
  --help, -h    이 도움말을 출력하고 종료합니다 (파일을 읽지 않습니다).
`;

/** 연결 문자열에서 자격증명 없이 대상 DB를 식별할 수 있는 정보만 뽑는다. */
function describeConnectionTarget(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname;
    const port = url.port || "5432";
    const database = url.pathname.replace(/^\/+/, "");
    return `${host}:${port}/${database}`;
  } catch {
    return "(연결 문자열 형식을 해석할 수 없습니다)";
  }
}

export type ReadEnvFileResult = { ok: true; content: string } | { ok: false; message: string };

/** .env.production.local 파일을 읽기만 한다 - 내용 파싱은 별도 순수 함수(아래)가 담당한다. */
export function readEnvFile(path: string): ReadEnvFileResult {
  try {
    return { ok: true, content: readFileSync(path, "utf8") };
  } catch {
    return {
      ok: false,
      message: `${path} 파일을 찾을 수 없습니다. 준비한 뒤 다시 실행하세요.`,
    };
  }
}

export type ResolveDatabaseUrlResult =
  | { ok: true; databaseUrl: string }
  | { ok: false; message: string };

/**
 * .env.production.local **파일 내용**만 파싱해 DATABASE_URL을 뽑는다. 이 함수는
 * process.env를 전혀 참조하지 않는다 - 시그니처에 process.env가 등장하지 않는다는
 * 사실 자체가, 부모 셸에 어떤 DATABASE_URL이 상속돼 있어도 이 함수의 결과에
 * 영향을 줄 수 없음을 구조적으로 보장한다.
 */
export function resolveDatabaseUrlFromFileContent(content: string): ResolveDatabaseUrlResult {
  const parsed = parseEnv(content);
  const databaseUrl = parsed.DATABASE_URL;
  if (!databaseUrl) {
    return { ok: false, message: `${ENV_FILE_PATH} 파일에 DATABASE_URL이 없습니다.` };
  }

  let protocol: string;
  try {
    protocol = new URL(databaseUrl).protocol;
  } catch {
    return { ok: false, message: "DATABASE_URL 형식을 해석할 수 없습니다." };
  }
  if (!ALLOWED_PROTOCOLS.has(protocol)) {
    return { ok: false, message: "DATABASE_URL의 프로토콜이 postgresql/postgres가 아닙니다." };
  }

  return { ok: true, databaseUrl };
}

export type PreflightResult =
  | { ok: true; databaseUrl: string }
  | { ok: false; message: string };

/**
 * 실제 DB 연결/입력 프롬프트를 시작하기 전에 확인해야 하는 안전 조건들.
 * main()에서 분리해 vitest로 직접 테스트할 수 있게 한다 - 이 harness의
 * Bash/PowerShell 도구는 stdin이 non-interactive라 실제 TTY 분기까지는
 * CLI를 직접 실행해 검증할 수 없으므로, process.stdin.isTTY와 파일 읽기 결과를
 * 파라미터로 주입받아 순수하게 테스트한다.
 */
export function checkPreflight(isTTY: boolean, fileResult: ReadEnvFileResult): PreflightResult {
  // 비밀번호를 stdin 파이프로 흘려받는 경로를 원천 차단한다 - 실제 터미널(TTY)이
  // 아니면 여기서 안전하게 중단한다.
  if (!isTTY) {
    return {
      ok: false,
      message:
        "이 스크립트는 실제 터미널에서만 실행할 수 있습니다 (비밀번호를 파이프/리다이렉션으로 받지 않습니다).",
    };
  }
  if (!fileResult.ok) {
    return { ok: false, message: fileResult.message };
  }
  return resolveDatabaseUrlFromFileContent(fileResult.content);
}

/**
 * 공개 readline API + 커스텀 Writable만으로 비밀번호 입력을 화면에 에코하지 않는다.
 * readline.Interface의 비공개 메서드(_writeToOutput 등)는 쓰지 않는다 - output을
 * 가로채는 Writable로 교체해, 우리가 명시적으로 쓴 프롬프트 문구 외에는 아무것도
 * 화면에 나가지 않게 한다. 백스페이스·Ctrl+C 등 줄 편집은 readline 자체가 그대로
 * 처리하므로(에코만 억제) 동작 자체는 평소 readline과 동일하게 안정적이다.
 */
function createPrompter() {
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) process.stdout.write(chunk);
      callback();
    },
  });
  const rl = readline.createInterface({ input: process.stdin, output, terminal: true });

  function ask(promptText: string): Promise<string> {
    return new Promise((resolve) => rl.question(promptText, resolve));
  }

  function askMasked(promptText: string): Promise<string> {
    return new Promise((resolve) => {
      output.write(promptText);
      muted = true;
      rl.question("", (answer) => {
        muted = false;
        output.write("\n");
        resolve(answer);
      });
    });
  }

  return { ask, askMasked, close: () => rl.close() };
}

async function main(): Promise<void> {
  // --help는 파일을 읽기 전에 처리한다 - .env.production.local이 없어도 동작해야 한다.
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  const preflight = checkPreflight(Boolean(process.stdin.isTTY), readEnvFile(ENV_FILE_PATH));
  if (!preflight.ok) {
    console.error(preflight.message);
    process.exitCode = 1;
    return;
  }
  const databaseUrl = preflight.databaseUrl;

  console.log(`대상 DB: ${describeConnectionTarget(databaseUrl)}`);

  const prompter = createPrompter();
  try {
    const confirm = await prompter.ask('이 DB에 관리자 계정을 생성하려면 "yes"를 입력하세요: ');
    if (confirm.trim() !== "yes") {
      console.log("취소되었습니다.");
      return;
    }

    const username = (await prompter.ask("관리자 아이디: ")).trim();
    const password = await prompter.askMasked("비밀번호: ");
    const passwordConfirm = await prompter.askMasked("비밀번호 확인: ");

    if (password !== passwordConfirm) {
      console.error("비밀번호가 일치하지 않습니다. 처음부터 다시 실행해주세요.");
      process.exitCode = 1;
      return;
    }

    const { PrismaClient } = await import("@/app/generated/prisma/client");
    const { PrismaNeon } = await import("@prisma/adapter-neon");
    const adapter = new PrismaNeon({ connectionString: databaseUrl });
    const prisma = new PrismaClient({ adapter });

    try {
      const result = await createInitialAdmin(prisma, username, password);
      if (result.ok) {
        console.log("관리자 계정이 생성되었습니다.");
      } else {
        console.error(`계정 생성에 실패했습니다 (${result.errorCode}).`);
        process.exitCode = 1;
      }
    } finally {
      await prisma.$disconnect();
    }
  } finally {
    prompter.close();
    console.log(`\n${ENV_FILE_PATH} 파일을 지금 바로 삭제하세요.`);
  }
}

// 이 파일을 직접 실행했을 때만 main()을 돌린다 - 테스트가 checkPreflight 등을
// import할 때 대화형 CLI 전체가 부수효과로 실행되는 것을 막는다.
const isMainModule =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]!).href === import.meta.url;
if (isMainModule) {
  main();
}
