"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ProgressButton } from "./action-progress";
import { Icon } from "./icons";

type DatabaseKind =
  | "attendance"
  | "gradeExam"
  | "gradeExamName"
  | "homeworkAssignment"
  | "homeworkSubmission"
  | "announcement"
  | "notification";

type CleanupSelection =
  | {
      source: "database";
      kind: DatabaseKind;
      key: string;
      recipientKey?: string;
    }
  | {
      source: "storage";
      publicId: string;
      resourceType: "image" | "raw";
    };

type CleanupItem = {
  id: string;
  source: "database" | "storage" | "protected";
  category: string;
  label: string;
  detail: string;
  createdAt?: string;
  bytes?: number;
  url?: string;
  selectable: boolean;
  selection?: CleanupSelection;
};

const categoryLabels: Record<string, string> = {
  attendance: "Ирц",
  gradeExam: "Шалгалт",
  gradeExamName: "Шалгалтын нэр",
  homeworkAssignment: "Багшийн даалгавар",
  homeworkSubmission: "Илгээсэн даалгавар",
  announcement: "Мэдээлэл, зар",
  notification: "Мэдэгдэл",
  image: "Зураг файл",
  raw: "Баримт файл",
  student: "Хамгаалалттай бүртгэл",
  teacher: "Багшийн нэвтрэх эрх",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

function formatDate(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("mn-MN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

async function readError(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | null;
  return payload?.error || "Хүсэлтийг боловсруулахад алдаа гарлаа.";
}

export function DataManagementPage() {
  const [items, setItems] = useState<CleanupItem[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);

  const loadItems = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/data-management", {
        cache: "no-store",
      });
      if (!response.ok) throw new Error(await readError(response));
      const payload = (await response.json()) as { items?: CleanupItem[] };
      setItems(payload.items ?? []);
      return payload.items ?? [];
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Өгөгдөл уншиж чадсангүй.",
      );
      return null;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("mn-MN");
    if (!query) return items;
    return items.filter((item) =>
      `${item.label} ${item.detail} ${categoryLabels[item.category] ?? item.category}`
        .toLocaleLowerCase("mn-MN")
        .includes(query),
    );
  }, [items, search]);

  const selectableItems = items.filter((item) => item.selectable);
  const databaseCount = selectableItems.filter(
    (item) => item.source === "database",
  ).length;
  const fileCount = selectableItems.filter(
    (item) => item.source === "storage",
  ).length;
  const protectedCount = items.filter((item) => !item.selectable).length;
  const selectedCount = items.filter(
    (item) => item.selectable && selected.has(item.id),
  ).length;

  function selectAll() {
    setSelected(new Set(selectableItems.map((item) => item.id)));
  }

  function toggleItem(item: CleanupItem) {
    if (!item.selectable) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(item.id)) next.delete(item.id);
      else next.add(item.id);
      return next;
    });
  }

  async function deleteSelected() {
    const selectedItems = items.filter(
      (item) => item.selectable && selected.has(item.id) && item.selection,
    );
    if (!acknowledged || !/^\d{4}$/.test(pin) || selectedItems.length === 0) {
      return false;
    }

    try {
      const response = await fetch("/api/data-management", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed: true,
          pin,
          items: selectedItems.map((item) => item.selection),
        }),
      });
      if (!response.ok) throw new Error(await readError(response));
      const result = (await response.json()) as {
        deletedCount: number;
        failedIds: string[];
      };
      const refreshedItems = await loadItems(false);
      const failed = new Set(result.failedIds ?? []);
      setSelected(
        new Set(
          (refreshedItems ?? [])
            .filter((item) => failed.has(item.id))
            .map((item) => item.id),
        ),
      );
      setPin("");
      setAcknowledged(false);
      setNotice(
        result.failedIds?.length
          ? `${result.deletedCount} зүйл устсан. ${result.failedIds.length} зүйл устсангүй; дахин оролдоно уу.`
          : `${result.deletedCount} зүйл устгалаа.`,
      );
      return true;
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Сонгосон зүйлсийг устгаж чадсангүй.",
      );
      return false;
    }
  }

  function closeConfirmation() {
    setConfirmOpen(false);
    setPin("");
    setAcknowledged(false);
  }

  return (
    <section className="data-cleanup-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">DATABASE · STORAGE</div>
          <h1>Өгөгдөл</h1>
          <p className="page-subtitle">
            Сургалтын мэдээлэл болон байршуулсан файлуудыг нэг дороос цэвэрлэнэ.
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={loading}
          onClick={() => void loadItems()}
          type="button"
        >
          <Icon name="arrow" size={15} /> Шинэчлэх
        </button>
      </div>

      <div className="data-cleanup-summary">
        <article className="stat-card">
          <div className="stat-top">Устгаж болох дата</div>
          <div className="stat-value">{databaseCount}</div>
          <div className="stat-foot">Ирц, дүн, даалгавар, мэдэгдэл</div>
        </article>
        <article className="stat-card">
          <div className="stat-top">Storage файл</div>
          <div className="stat-value">{fileCount}</div>
          <div className="stat-foot">Зураг болон баримт бичиг</div>
        </article>
        <article className="stat-card data-cleanup-protected-card">
          <div className="stat-top">Хамгаалалттай бүртгэл</div>
          <div className="stat-value">{protectedCount}</div>
          <div className="stat-foot">Нэвтрэх эрх болон сурагчийн бүртгэл</div>
        </article>
      </div>

      <div className="data-cleanup-notice">
        <Icon name="lock" size={17} />
        <p>
          Бүртгэлтэй сурагч болон нэвтрэх эрх энэ цэснээс устахгүй. Сурагчийн
          бүртгэлийг зөвхөн “Сурагчид” хэсгээс устгана.
        </p>
      </div>

      {notice && (
        <div className="data-cleanup-status" role="status">
          {notice}
          <button aria-label="Мэдэгдэл хаах" onClick={() => setNotice("")} type="button">
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {loadError && <div className="form-error" role="alert">{loadError}</div>}

      <section aria-label="Хадгалсан өгөгдлийн жагсаалт" className="panel data-cleanup-panel">
        <div className="data-cleanup-toolbar">
          <div>
            <h2 className="panel-title">Хадгалсан мэдээлэл</h2>
            <p className="panel-subtitle">
              {filteredItems.length} мөр · {selectedCount} сонгосон
            </p>
          </div>
          <div className="data-cleanup-controls">
            <input
              aria-label="Өгөгдөл хайх"
              className="search-input"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Нэр, төрлөөр хайх"
              type="search"
              value={search}
            />
            <button
              className="secondary-button"
              disabled={selectableItems.length === 0}
              onClick={selectAll}
              type="button"
            >
              Бүгдийг сонгох
            </button>
            <button
              className="secondary-button"
              disabled={selectedCount === 0}
              onClick={() => setSelected(new Set())}
              type="button"
            >
              Сонголт цуцлах
            </button>
            <button
              className="danger-button data-cleanup-delete-button"
              disabled={selectedCount === 0}
              onClick={() => {
                setAcknowledged(false);
                setConfirmOpen(true);
              }}
              type="button"
            >
              <Icon name="trash" size={14} /> Сонгосныг устгах ({selectedCount})
            </button>
          </div>
        </div>

        {loading ? (
          <div className="empty-state">Өгөгдөл уншиж байна…</div>
        ) : filteredItems.length === 0 ? (
          <div className="empty-state">
            {items.length === 0 ? "Хадгалсан өгөгдөл алга." : "Хайлтад тохирох зүйл олдсонгүй."}
          </div>
        ) : (
          <div className="data-cleanup-list">
            {filteredItems.map((item) => (
              <article className="data-cleanup-row" key={item.id}>
                <label className="data-cleanup-check">
                  <input
                    aria-label={`${item.label} сонгох`}
                    checked={selected.has(item.id)}
                    disabled={!item.selectable}
                    onChange={() => toggleItem(item)}
                    type="checkbox"
                  />
                </label>
                <div className="data-cleanup-row-icon">
                  <Icon
                    name={item.source === "storage" ? "file" : item.selectable ? "trash" : "lock"}
                    size={16}
                  />
                </div>
                <div className="data-cleanup-row-content">
                  <div className="data-cleanup-row-heading">
                    <strong>{item.label}</strong>
                    <span className={`data-cleanup-badge ${item.selectable ? "" : "protected"}`}>
                      {categoryLabels[item.category] ?? item.category}
                    </span>
                  </div>
                  <p>{item.detail}</p>
                  <div className="data-cleanup-row-meta">
                    {item.createdAt && <span>{formatDate(item.createdAt)}</span>}
                    {item.source === "storage" && item.bytes !== undefined && (
                      <span>{formatBytes(item.bytes)}</span>
                    )}
                    {!item.selectable && <span>Зөвхөн бүртгэлийн хэсгээс устгана</span>}
                  </div>
                </div>
                {item.url && (
                  <a
                    className="data-cleanup-open-file"
                    href={item.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Файл нээх
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {confirmOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeConfirmation();
          }}
        >
          <section
            aria-labelledby="data-cleanup-confirm-title"
            aria-modal="true"
            className="modal data-cleanup-modal"
            role="dialog"
          >
            <div className="data-cleanup-modal-icon">
              <Icon name="trash" size={20} />
            </div>
            <h2 id="data-cleanup-confirm-title">Сонгосон зүйлсийг устгах уу?</h2>
            <p className="data-cleanup-warning">
              {selectedCount} зүйл Firebase Database эсвэл Storage-оос бүрмөсөн
              устаж, сэргээх боломжгүй болно. Үргэлжлүүлэхийн өмнө жагсаалтаа шалгана уу.
            </p>
            <div className="data-cleanup-preserve-note">
              Багшийн PIN болон бүртгэлтэй сурагчдын нэвтрэх эрх устахгүй.
            </div>
            <label className="data-cleanup-acknowledge">
              <input
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                type="checkbox"
              />
              <span>Сонгосон өгөгдлийг бүрмөсөн устгахыг зөвшөөрч байна.</span>
            </label>
            <label className="data-cleanup-pin-field">
              <span>Багшийн 4 оронтой PIN</span>
              <input
                autoComplete="current-password"
                className="form-input"
                inputMode="numeric"
                maxLength={4}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="••••"
                type="password"
                value={pin}
              />
            </label>
            <div className="modal-actions">
              <button className="secondary-button" onClick={closeConfirmation} type="button">
                Болих
              </button>
              <ProgressButton
                className="danger-button"
                disabled={!acknowledged || !/^\d{4}$/.test(pin) || selectedCount === 0}
                loadingLabel="Устгаж байна"
                onClick={deleteSelected}
                onComplete={closeConfirmation}
                type="button"
              >
                <Icon name="trash" size={14} /> Устгах
              </ProgressButton>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
