"use client";

import { useState } from "react";
import { useOfferTemplates } from "@/hooks/useOfferTemplates";

export default function TemplatesPage() {
  const { templates, hydrated, save, update, remove, setDefault, duplicate } = useOfferTemplates();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [showForm, setShowForm] = useState(false);

  if (!hydrated) return <div className="text-sm text-muted">Lädt…</div>;

  function handleSave() {
    if (!newName.trim() || !newContent.trim()) return;
    save(newName.trim(), newContent.trim());
    setNewName("");
    setNewContent("");
    setShowForm(false);
  }

  function handleUpdate(id: string, name: string, content: string) {
    update(id, { name: name.trim(), content: content.trim() });
    setEditingId(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Angebotsvorlagen</h1>
          <p className="mt-1 text-sm text-muted">
            {templates.length}/10 Vorlagen — der LLM passt den Angebotstext an den Stil der gewählten Vorlage an.
          </p>
        </div>
        {templates.length < 10 && (
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg border border-accent/50 bg-transparent px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
          >
            {showForm ? "Abbrechen" : "Neue Vorlage"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="space-y-3 rounded-xl border border-accent/30 bg-surface/60 p-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name (z.B. 'Kurz & direkt')"
            className="w-full rounded-md border border-white/15 bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="Vorlagentext — so soll dein Angebot klingen…"
            rows={8}
            className="w-full resize-y rounded-md border border-white/15 bg-surface px-3 py-2 text-sm text-white outline-none placeholder:text-muted focus:ring-1 focus:ring-accent"
          />
          <button
            type="button"
            onClick={handleSave}
            disabled={!newName.trim() || !newContent.trim()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background transition hover:brightness-110 disabled:opacity-50"
          >
            Speichern
          </button>
        </div>
      )}

      {templates.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-white/20 bg-surface/40 px-6 py-12 text-center">
          <p className="text-sm text-muted">Noch keine Vorlagen. Erstelle eine, um deinen Angebotstexten einen eigenen Stil zu geben.</p>
        </div>
      )}

      <ul className="space-y-3">
        {templates.map((tpl) => {
          const isEditing = editingId === tpl.id;
          return (
            <li key={tpl.id} className="overflow-hidden rounded-xl border border-white/10 bg-surface/60">
              {isEditing ? (
                <EditForm
                  name={tpl.name}
                  content={tpl.content}
                  onSave={(name, content) => handleUpdate(tpl.id, name, content)}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-white">{tpl.name}</h3>
                      {tpl.isDefault && (
                        <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent">Standard</span>
                      )}
                    </div>
                    <div className="flex gap-1.5">
                      {!tpl.isDefault && (
                        <button type="button" onClick={() => setDefault(tpl.id)} className="rounded-md border border-white/15 px-2 py-1 text-xs text-muted transition hover:text-white">★ Standard</button>
                      )}
                      <button type="button" onClick={() => setEditingId(tpl.id)} className="rounded-md border border-white/15 px-2 py-1 text-xs text-muted transition hover:text-white">Bearbeiten</button>
                      <button type="button" onClick={() => duplicate(tpl.id)} className="rounded-md border border-white/15 px-2 py-1 text-xs text-muted transition hover:text-white">Kopieren</button>
                      <button type="button" onClick={() => remove(tpl.id)} className="rounded-md border border-red-500/40 px-2 py-1 text-xs text-red-300 transition hover:bg-red-500/20">Löschen</button>
                    </div>
                  </div>
                  <pre className="mt-3 max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-black/25 p-3 text-xs text-white/80">{tpl.content}</pre>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EditForm({ name, content, onSave, onCancel }: { name: string; content: string; onSave: (n: string, c: string) => void; onCancel: () => void }) {
  const [n, setN] = useState(name);
  const [c, setC] = useState(content);
  return (
    <div className="space-y-3 p-4">
      <input value={n} onChange={(e) => setN(e.target.value)} className="w-full rounded-md border border-white/15 bg-surface px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-accent" />
      <textarea value={c} onChange={(e) => setC(e.target.value)} rows={8} className="w-full resize-y rounded-md border border-white/15 bg-surface px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-accent" />
      <div className="flex gap-2">
        <button type="button" onClick={() => onSave(n, c)} disabled={!n.trim() || !c.trim()} className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-background disabled:opacity-50">Speichern</button>
        <button type="button" onClick={onCancel} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-muted hover:text-white">Abbrechen</button>
      </div>
    </div>
  );
}
