"use client";

import { useRef, useState } from "react";
import { CASHFLOW_TYPES, cashflowTypeLabelT } from "@/lib/categories";
import { errorMessage, formatFileSize } from "@/lib/csvImportUi";
import { useLocale } from "@/lib/i18n/LocaleProvider";

type SourceType = "BANK" | "CARD";
type CashflowType = "INCOME" | "FIXED_EXPENSE" | "VARIABLE_EXPENSE";

interface PreviewRow {
  rowNumber: number;
  transactionDate: string;
  yearMonth: string;
  type: CashflowType;
  category: string;
  amount: number;
  description: string;
  occurrenceIndex: number;
  sameFileDuplicate: boolean;
  previouslyDeleted: boolean;
  crossFileCandidate: boolean;
  crossFileConfidence: "HIGH" | null;
}

interface PreviewErrorRow {
  rowNumber: number;
  code: string;
}

interface RowEdit {
  type: CashflowType;
  category: string;
  amount: string;
  transactionDate: string;
  description: string;
}

interface ConfirmResult {
  createdCount: number;
  skippedCount: number;
  candidateCount: number;
}

const MAX_CLIENT_FILE_SIZE = 5 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".csv", ".xlsx"];

function toEdit(row: PreviewRow): RowEdit {
  return {
    type: row.type,
    category: row.category,
    amount: String(row.amount),
    transactionDate: row.transactionDate,
    description: row.description,
  };
}

export function CsvImportPanel({
  onCancel,
  onImported,
}: {
  onCancel: () => void;
  onImported: () => void;
}) {
  const { t } = useLocale();

  const [sourceType, setSourceType] = useState<SourceType>("BANK");
  const [sourceLabel, setSourceLabel] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [previewErrors, setPreviewErrors] = useState<PreviewErrorRow[]>([]);
  const [included, setIncluded] = useState<Set<number>>(new Set());
  const [edits, setEdits] = useState<Record<number, RowEdit>>({});

  const [previewLoading, setPreviewLoading] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [result, setResult] = useState<ConfirmResult | null>(null);

  const requestIdRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const busy = previewLoading || confirmLoading;

  function discardPreview() {
    setPreviewToken(null);
    setPreviewRows([]);
    setPreviewErrors([]);
    setIncluded(new Set());
    setEdits({});
    setFormError(null);
    setResult(null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    discardPreview();
    setFileError(null);

    if (!picked) {
      setFile(null);
      return;
    }
    const lowerName = picked.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      setFileError(t("cashflow.csvImportInvalidExtension"));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    if (picked.size > MAX_CLIENT_FILE_SIZE) {
      setFileError(t("cashflow.csvImportFileTooLarge"));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(picked);
  }

  function handleSourceTypeChange(value: SourceType) {
    setSourceType(value);
    discardPreview();
  }

  function handleSourceLabelChange(value: string) {
    setSourceLabel(value);
    discardPreview();
  }

  async function handlePreview() {
    if (!file || busy) return;
    const myRequestId = ++requestIdRef.current;
    setPreviewLoading(true);
    setFormError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.set("file", file);
      formData.set("sourceType", sourceType);
      if (sourceLabel.trim()) formData.set("sourceLabel", sourceLabel.trim());

      const res = await fetch("/api/cashflow/csv-preview", { method: "POST", body: formData });
      const data = await res.json();
      if (requestIdRef.current !== myRequestId) return;

      if (!res.ok) {
        // 서버가 반환한 data.error(한국어 고정 문구)는 표시하지 않는다 - 영어 로케일에서
        // 한국어가 섞여 나오는 걸 막기 위해, 실패 사유와 무관하게 항상 번역된 일반 문구만 쓴다.
        setFormError(t("cashflow.csvImportPreviewFailed"));
        return;
      }

      const rows = (data.rows ?? []) as PreviewRow[];
      const nextIncluded = new Set<number>();
      const nextEdits: Record<number, RowEdit> = {};
      for (const row of rows) {
        if (!row.sameFileDuplicate && !row.previouslyDeleted) {
          nextIncluded.add(row.rowNumber);
          nextEdits[row.rowNumber] = toEdit(row);
        }
      }
      setPreviewToken(data.previewToken);
      setPreviewRows(rows);
      setPreviewErrors((data.errors ?? []) as PreviewErrorRow[]);
      setIncluded(nextIncluded);
      setEdits(nextEdits);
    } catch {
      if (requestIdRef.current !== myRequestId) return;
      setFormError(t("common.networkError"));
    } finally {
      if (requestIdRef.current === myRequestId) setPreviewLoading(false);
    }
  }

  function toggleIncluded(rowNumber: number) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  function updateEdit<K extends keyof RowEdit>(rowNumber: number, key: K, value: RowEdit[K]) {
    setEdits((prev) => ({ ...prev, [rowNumber]: { ...prev[rowNumber], [key]: value } }));
  }

  async function handleConfirm() {
    if (!file || !previewToken || busy) return;
    if (included.size === 0) {
      setFormError(t("cashflow.csvImportNoRowsSelected"));
      return;
    }

    const myRequestId = ++requestIdRef.current;
    setConfirmLoading(true);
    setFormError(null);
    try {
      const selections = Array.from(included).map((rowNumber) => {
        const edit = edits[rowNumber];
        return {
          rowNumber,
          include: true,
          type: edit.type,
          category: edit.category.trim(),
          amount: Number(edit.amount),
          transactionDate: edit.transactionDate,
          description: edit.description.trim(),
        };
      });

      const formData = new FormData();
      formData.set("file", file);
      formData.set("sourceType", sourceType);
      if (sourceLabel.trim()) formData.set("sourceLabel", sourceLabel.trim());
      formData.set("previewToken", previewToken);
      formData.set("selections", JSON.stringify(selections));

      const res = await fetch("/api/cashflow/csv-confirm", { method: "POST", body: formData });
      const data = await res.json();
      if (requestIdRef.current !== myRequestId) return;

      if (!res.ok) {
        // previewToken 불일치, 검증 실패, 서버 오류(500) 등 사유와 무관하게 서버 원문은
        // 표시하지 않고 항상 번역된 일반 문구만 쓴다 (영어 로케일에 한국어가 섞이지 않도록).
        setFormError(t("cashflow.csvImportFailed"));
        return;
      }

      setPreviewToken(null);
      setPreviewRows([]);
      setPreviewErrors([]);
      setIncluded(new Set());
      setEdits({});
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setResult(data as ConfirmResult);
      onImported();
    } catch {
      if (requestIdRef.current !== myRequestId) return;
      setFormError(t("common.networkError"));
    } finally {
      if (requestIdRef.current === myRequestId) setConfirmLoading(false);
    }
  }

  function handleCancel() {
    requestIdRef.current++;
    onCancel();
  }

  const eligibleRows = previewRows.filter((r) => !r.sameFileDuplicate && !r.previouslyDeleted);
  const duplicateRows = previewRows.filter((r) => r.sameFileDuplicate || r.previouslyDeleted);

  const resultMessages = result
    ? [
        result.createdCount > 0
          ? t("cashflow.csvImportResultCreated", { count: result.createdCount })
          : t("cashflow.csvImportResultNone"),
        result.skippedCount > 0
          ? t("cashflow.csvImportResultSkipped", { count: result.skippedCount })
          : null,
        result.candidateCount > 0
          ? t("cashflow.csvImportResultCandidate", { count: result.candidateCount })
          : null,
      ].filter((m): m is string => Boolean(m))
    : [];

  return (
    <div
      className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
      aria-busy={busy}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="csv-import-source-type" className="text-xs font-medium text-slate-600">
            {t("cashflow.csvImportSourceTypeLabel")}
          </label>
          <select
            id="csv-import-source-type"
            value={sourceType}
            disabled={busy}
            onChange={(e) => handleSourceTypeChange(e.target.value as SourceType)}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="BANK">{t("cashflow.csvImportSourceTypeBank")}</option>
            <option value="CARD">{t("cashflow.csvImportSourceTypeCard")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="csv-import-source-label" className="text-xs font-medium text-slate-600">
            {t("cashflow.csvImportSourceLabelLabel")}
          </label>
          <input
            id="csv-import-source-label"
            value={sourceLabel}
            disabled={busy}
            onChange={(e) => handleSourceLabelChange(e.target.value)}
            placeholder={t("cashflow.csvImportSourceLabelPlaceholder")}
            className="rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="csv-import-file"
          className={`inline-flex min-h-[44px] w-fit items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 ${
            busy ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-slate-100"
          }`}
        >
          {t("cashflow.csvImportChooseFile")}
          <input
            ref={fileInputRef}
            id="csv-import-file"
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy}
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
        <p className="text-xs text-slate-400">{t("cashflow.csvImportFileHint")}</p>
        {file && (
          <p className="text-xs text-slate-500">
            {t("cashflow.csvImportSelectedFile", { name: file.name, size: formatFileSize(file.size) })}
          </p>
        )}
        {fileError && (
          <p className="text-sm text-red-600" aria-live="polite">
            {fileError}
          </p>
        )}
      </div>

      {formError && (
        <p className="text-sm text-red-600" aria-live="polite">
          {formError}
        </p>
      )}

      {resultMessages.length > 0 && (
        <p className="text-sm text-emerald-600" aria-live="polite">
          {resultMessages.join(" · ")}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handlePreview}
          disabled={!file || busy}
          className="min-h-[44px] rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          {previewLoading ? t("cashflow.csvImportPreviewing") : t("cashflow.csvImportPreviewButton")}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={confirmLoading}
          className="min-h-[44px] rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
        >
          {t("common.close")}
        </button>
      </div>

      {previewErrors.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <h3 className="text-xs font-semibold text-amber-800">
            {t("cashflow.csvImportErrorsTitle", { count: previewErrors.length })}
          </h3>
          <ul className="mt-1 flex flex-col gap-0.5">
            {previewErrors.map((err) => (
              <li key={err.rowNumber} className="text-xs text-amber-700">
                {t("cashflow.csvImportErrorRow", {
                  rowNumber: err.rowNumber,
                  message: errorMessage(t, err.code),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}

      {previewRows.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-slate-700">
            {t("cashflow.csvImportRowsTitle", { count: previewRows.length })}
          </h3>

          <div className="flex flex-col gap-3">
            {eligibleRows.map((row) => {
              const edit = edits[row.rowNumber];
              if (!edit) return null;
              const checkboxId = `csv-import-row-${row.rowNumber}`;
              return (
                <div
                  key={row.rowNumber}
                  className={`rounded-2xl border p-4 shadow-sm ${
                    included.has(row.rowNumber) ? "border-accent bg-white" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      id={checkboxId}
                      type="checkbox"
                      checked={included.has(row.rowNumber)}
                      onChange={() => toggleIncluded(row.rowNumber)}
                      disabled={busy}
                      className="h-4 w-4"
                      aria-label={`${t("cashflow.csvImportColInclude")}: ${edit.category} ${edit.amount}`}
                    />
                    <label htmlFor={checkboxId} className="text-xs font-medium text-slate-500">
                      {t("cashflow.csvImportColInclude")}
                    </label>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`${checkboxId}-type`}
                        className="text-xs font-medium text-slate-600"
                      >
                        {t("cashflow.colType")}
                      </label>
                      <select
                        id={`${checkboxId}-type`}
                        value={edit.type}
                        disabled={busy}
                        onChange={(e) =>
                          updateEdit(row.rowNumber, "type", e.target.value as CashflowType)
                        }
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      >
                        {CASHFLOW_TYPES.map((c) => (
                          <option key={c.value} value={c.value}>
                            {cashflowTypeLabelT(t, c.value)}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`${checkboxId}-category`}
                        className="text-xs font-medium text-slate-600"
                      >
                        {t("cashflow.colCategory")}
                      </label>
                      <input
                        id={`${checkboxId}-category`}
                        required
                        maxLength={50}
                        value={edit.category}
                        disabled={busy}
                        onChange={(e) => updateEdit(row.rowNumber, "category", e.target.value)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`${checkboxId}-amount`}
                        className="text-xs font-medium text-slate-600"
                      >
                        {t("cashflow.colAmount")}
                      </label>
                      <input
                        id={`${checkboxId}-amount`}
                        required
                        type="number"
                        min={1}
                        value={edit.amount}
                        disabled={busy}
                        onChange={(e) => updateEdit(row.rowNumber, "amount", e.target.value)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`${checkboxId}-date`}
                        className="text-xs font-medium text-slate-600"
                      >
                        {t("cashflow.csvImportColDate")}
                      </label>
                      <input
                        id={`${checkboxId}-date`}
                        required
                        type="date"
                        value={edit.transactionDate}
                        disabled={busy}
                        onChange={(e) => updateEdit(row.rowNumber, "transactionDate", e.target.value)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor={`${checkboxId}-description`}
                        className="text-xs font-medium text-slate-600"
                      >
                        {t("cashflow.colMemo")}
                      </label>
                      <input
                        id={`${checkboxId}-description`}
                        maxLength={300}
                        value={edit.description}
                        disabled={busy}
                        onChange={(e) => updateEdit(row.rowNumber, "description", e.target.value)}
                        className="rounded-md border border-slate-300 px-3 py-2 text-sm"
                      />
                    </div>
                  </div>
                </div>
              );
            })}

            {duplicateRows.map((row) => (
              <div
                key={row.rowNumber}
                className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-400"
              >
                <div className="flex items-center justify-between gap-2">
                  <span>
                    {row.transactionDate} · {row.category} · {row.amount}
                  </span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                    {row.previouslyDeleted
                      ? t("cashflow.csvImportPreviouslyDeleted")
                      : t("cashflow.csvImportSameFileDuplicate")}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || included.size === 0}
              className="min-h-[44px] rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              {confirmLoading ? t("cashflow.csvImportConfirming") : t("cashflow.csvImportConfirmButton")}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={confirmLoading}
              className="min-h-[44px] rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-50"
            >
              {t("cashflow.csvImportCancelButton")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
