"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEAL_EDITABLE_FIELDS,
  parseDealFieldValue,
  type DealEditableField,
  UFS,
  type DealEditableColumn,
} from "@/lib/ghl/deal-fields";

export type DealFieldsUpdate = { deal_id: string } & Record<string, unknown>;

interface EditableDealCellProps {
  dealId: string;
  column: DealEditableColumn;
  /** Valores já usados nessa coluna: sugeridos para não criar variações do mesmo texto. */
  suggestions: string[];
  onSaved: (update: DealFieldsUpdate) => void;
}

/**
 * Célula vazia da planilha de negócios que dá para preencher ali mesmo. Grava
 * no card do GHL ao confirmar (Enter ou ✓) -- nunca ao sair do campo, para um
 * clique fora não escrever no CRM sem querer.
 */
export function EditableDealCell({
  dealId,
  column,
  suggestions,
  onSaved,
}: EditableDealCellProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { kind, label, opcoes } = DEAL_EDITABLE_FIELDS[column] as DealEditableField;
  const listId = `sugestoes-${column}-${dealId}`;

  function cancel() {
    setEditing(false);
    setValue("");
    setError(null);
  }

  async function save() {
    const parsed = parseDealFieldValue(column, value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/deals/${encodeURIComponent(dealId)}/campo`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ campo: column, valor: value }),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
      onSaved(data.deal as DealFieldsUpdate);
      cancel();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
        title={`Preencher ${label} no GHL`}
      >
        -
        <Pencil className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
      </button>
    );
  }

  return (
    <div className="flex min-w-[180px] flex-col gap-1">
      <form
        className="flex items-center gap-1"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") cancel();
        }}
      >
        {kind === "uf" ? (
          <select
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
            aria-label={label}
          >
            <option value="">UF</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        ) : kind === "opcao" ? (
          <select
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-sm"
            aria-label={label}
          >
            <option value="">Escolha</option>
            {(opcoes ?? []).map((opcao) => (
              <option key={opcao.valor} value={opcao.valor}>
                {opcao.rotulo}
              </option>
            ))}
          </select>
        ) : (
          <Input
            autoFocus
            type={kind === "data" ? "date" : kind === "numero" ? "number" : "text"}
            inputMode={kind === "dinheiro" ? "decimal" : undefined}
            placeholder={kind === "dinheiro" ? "0,00" : undefined}
            min={kind === "numero" ? 1 : undefined}
            step={kind === "numero" ? 1 : undefined}
            list={kind === "texto" ? listId : undefined}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            className="h-8 text-sm"
            aria-label={label}
          />
        )}
        {kind === "texto" ? (
          <datalist id={listId}>
            {suggestions.map((suggestion) => (
              <option key={suggestion} value={suggestion} />
            ))}
          </datalist>
        ) : null}
        <Button
          type="submit"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          disabled={saving}
          aria-label={`Gravar ${label} no GHL`}
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-8 w-8 shrink-0"
          disabled={saving}
          onClick={cancel}
          aria-label="Cancelar"
        >
          <X className="h-4 w-4" />
        </Button>
      </form>
      {error ? <p className="max-w-[260px] text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
