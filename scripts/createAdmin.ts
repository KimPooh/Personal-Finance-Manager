import readline from "node:readline";
import { Writable } from "node:stream";
import { pathToFileURL } from "node:url";
import { createInitialAdmin } from "@/lib/adminSetup";

// 운영 관리자(AppUser) 계정을 1회 생성하는 대화형 CLI. 공개 HTTP 라우트가 아니라
// 소유자가 자신의 터미널에서 직접 실행하는 운영 도구다.
//
// 실행 방법: npm run create-admin
//   내부적으로 `node --env-file=.env.production.local --import tsx scripts/createAdmin.ts`를
//   실행한다. DOTENV_CONFIG_PATH=... 같은 셸별 환경변수-앞에-붙이기 문법은 PowerShell에서
//   동작하지 않아 쓰지 않는다 - Node 20.6+ 내장 --env-file과 --import(tsx)만으로 셸에
//   무관하게 고정된 커맨드 하나로 동작한다.
//
// 자격증명은 CLI 인자로 절대 받지 않는다(셸 히스토리에 남는 걸 방지) - DATABASE_URL은
// .env.production.local(gitignore 대상)에서만, 아이디/비밀번호는 이 스크립트의 대화형
// 프롬프트에서만 받는다. 성공/실패 메시지 어디에도 아이디·비밀번호·연결 문자열을
// 출력하지 않는다.

const HELP_TEXT = `사용법: npm run create-admin

운영 DB에 관리자(AppUser) 계정을 1회 생성하는 대화형 CLI입니다.

사전 준비:
  1. .env.production.local 파일(gitignore 대상)에 운영 DATABASE_URL을 설정하세요.
  2. npm run create-admin 으로 실행하세요.
  3. 완료 후 .env.production.local 파일을 즉시 삭제하세요.

옵션:
  --help, -h    이 도움말을 출력하고 종료합니다 (DB에 연결하지 않습니다).
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

export type PreflightResult =
  | { ok: true; databaseUrl: string }
  | { ok: false; message: string };

/**
 * 실제 DB 연결/입력 프롬프트를 시작하기 전에 확인해야 하는 두 가지 안전 조건.
 * main()에서 분리해 vitest로 직접 테스트할 수 있게 한다 - 이 harness의
 * Bash/PowerShell 도구는 stdin이 non-interactive라 실제 TTY 분기까지는
 * CLI를 직접 실행해 검증할 수 없으므로, process.stdin.isTTY를 파라미터로
 * 주입받아 순수하게 테스트한다.
 */
export function checkPreflight(isTTY: boolean, databaseUrl: string | undefined): PreflightResult {
  // 비밀번호를 stdin 파이프로 흘려받는 경로를 원천 차단한다 - 실제 터미널(TTY)이
  // 아니면 여기서 안전하게 중단한다.
  if (!isTTY) {
    return {
      ok: false,
      message:
        "이 스크립트는 실제 터미널에서만 실행할 수 있습니다 (비밀번호를 파이프/리다이렉션으로 받지 않습니다).",
    };
  }
  if (!databaseUrl) {
    return {
      ok: false,
      message:
        "DATABASE_URL이 설정되지 않았습니다. .env.production.local을 준비한 뒤 " +
        "npm run create-admin으로 다시 실행하세요.",
    };
  }
  return { ok: true, databaseUrl };
}

async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(HELP_TEXT);
    return;
  }

  const preflight = checkPreflight(Boolean(process.stdin.isTTY), process.env.DATABASE_URL);
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
    console.log("\n.env.production.local 파일을 지금 바로 삭제하세요.");
  }
}

// 이 파일을 직접 실행했을 때만 main()을 돌린다 - 테스트가 checkPreflight 등을
// import할 때 대화형 CLI 전체가 부수효과로 실행되는 것을 막는다.
const isMainModule =
  Boolean(process.argv[1]) && pathToFileURL(process.argv[1]!).href === import.meta.url;
if (isMainModule) {
  main();
}
