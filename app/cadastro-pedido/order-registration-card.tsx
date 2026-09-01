"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ExternalLink,
  FileCheck2,
  Loader2,
  Palette,
  PencilLine,
  Plus,
  ReceiptText,
  Save,
  Trash2,
  Truck,
  TriangleAlert,
  Upload,
  UserRound,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  blankOrderRegistrationModel,
  createOrderRegistrationDraft,
  getOrderRegistrationValidationIssues,
  type OrderRegistrationConfig,
  type OrderRegistrationDraft,
  type OrderRegistrationModelDefinition,
  type OrderRegistrationOpportunity,
  type OrderRegistrationOption,
} from "@/lib/ghl/order-registration-shared";

import { cn } from "@/lib/utils";
const GHL_LOCATION_ID = "dhz2q752HHI3xw2jHkrv";
const PAYMENT_PROOF_ACCEPT =
  ".pdf,.docx,.doc,.jpg,.jpeg,.png,.gif,.csv,.xlsx,.xls,.mp4,.mpeg,.zip,.rar,.txt,.svg";

type SaveResponse = {
  opportunity?: OrderRegistrationOpportunity;
  error?: string;
  issues?: string[];
};


const INVALID_FIELD_CLASS =
  "border-destructive bg-destructive/5 ring-2 ring-destructive/15 focus-visible:ring-destructive/30";

function FieldError({
  id,
  message,
}: {
  id: string;
  message?: string;
}) {
  if (!message) return null;
  return (
    <p
      id={id}
      role="alert"
      className="flex items-start gap-1.5 text-xs font-medium text-destructive"
    >
      <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>{message}</span>
    </p>
  );
}
function formatMoney(value: number | null): string {
  if (value === null) return "Não informado";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatDateInput(value: string): string {
  if (!value) return "Não informada";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatDateTime(value: string | null): string {
  if (!value) return "Não informado";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatFileSize(value: number | null): string {
  if (value === null) return "";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeGradeLabel(label: string): string {
  return label.trim().toLocaleLowerCase("pt-BR");
}

function orderTypeBadgeClass(orderType: string): string {
  const normalized = orderType
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  if (normalized === "evento") {
    return "border-purple-500 bg-purple-50 text-purple-700 hover:bg-purple-50 dark:border-purple-400 dark:bg-purple-950/70 dark:text-purple-200";
  }
  if (normalized === "amostra") {
    return "border-orange-500 bg-orange-50 text-orange-700 hover:bg-orange-50 dark:border-orange-400 dark:bg-orange-950/70 dark:text-orange-200";
  }
  if (normalized === "reposicao") {
    return "border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-50 dark:border-blue-400 dark:bg-blue-950/70 dark:text-blue-200";
  }
  if (normalized === "pedido") {
    return "border-green-600 bg-green-50 text-green-700 hover:bg-green-50 dark:border-green-400 dark:bg-green-950/70 dark:text-green-200";
  }
  return "border-muted-foreground/40 bg-muted text-muted-foreground hover:bg-muted";
}

function orderTypeAccentClass(orderType: string): string {
  const normalized = orderType
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");

  if (normalized === "evento") return "border-l-purple-500";
  if (normalized === "amostra") return "border-l-orange-500";
  if (normalized === "reposicao") return "border-l-blue-500";
  if (normalized === "pedido") return "border-l-green-600";
  return "border-l-muted-foreground/40";
}

function remapGradeValues(
  values: Record<string, string>,
  sourceOptions: OrderRegistrationOption[],
  targetOptions: OrderRegistrationOption[],
): Record<string, string> {
  const valuesByLabel = new Map(
    sourceOptions.map((option) => [
      normalizeGradeLabel(option.label),
      values[option.id] ?? "",
    ]),
  );
  const remapped: Record<string, string> = {};
  for (const option of targetOptions) {
    const value = valuesByLabel.get(normalizeGradeLabel(option.label));
    if (value) remapped[option.id] = value;
  }
  return remapped;
}

function remapModelToDefinition(
  model: OrderRegistrationDraft["models"][number],
  sourceDefinition: OrderRegistrationModelDefinition,
  targetDefinition: OrderRegistrationModelDefinition,
): OrderRegistrationDraft["models"][number] {
  return {
    ...model,
    modelNumber: targetDefinition.modelNumber,
    adultGrade: remapGradeValues(
      model.adultGrade,
      sourceDefinition.adultOptions,
      targetDefinition.adultOptions,
    ),
    childGrade: remapGradeValues(
      model.childGrade,
      sourceDefinition.childOptions,
      targetDefinition.childOptions,
    ),
  };
}

function SummaryField({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof CalendarDays;
}) {
  return (
    <div className="min-w-0 px-4 py-3 first:pl-0 last:pr-0">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>{label}</span>
      </div>
      <p className="mt-1 truncate text-sm font-medium" title={value}>
        {value}
      </p>
    </div>
  );
}

function GradeFields({
  label,
  fieldId,
  options,
  values,
  error,
  onChange,
}: {
  label: string;
  fieldId: string;
  options: OrderRegistrationOption[];
  values: Record<string, string>;
  error?: string;
  onChange: (optionId: string, value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <div
        className={cn(
          "grid gap-2 rounded-lg sm:grid-cols-3 xl:grid-cols-6",
          error && "border border-destructive bg-destructive/5 p-3",
        )}
        role="group"
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${fieldId}-error` : undefined}
      >
        {options.map((option) => (
          <div key={option.id} className="space-y-1.5">
            <Label
              htmlFor={`grade-${label}-${option.id}`}
              className="text-xs text-muted-foreground"
            >
              {option.label}
            </Label>
            <Input
              id={`grade-${label}-${option.id}`}
              className={cn(error && INVALID_FIELD_CLASS)}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? `${fieldId}-error` : undefined}
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              value={values[option.id] ?? ""}
              onChange={(event) => onChange(option.id, event.target.value)}
              placeholder="0"
            />
          </div>
        ))}
      </div>
      <FieldError id={`${fieldId}-error`} message={error} />
    </div>
  );
}

function ModelFields({
  definition,
  model,
  fieldErrors,
  onChange,
  onRemove,
}: {
  definition: OrderRegistrationModelDefinition;
  model: OrderRegistrationDraft["models"][number];
  fieldErrors: ReadonlyMap<string, string>;
  onChange: (model: OrderRegistrationDraft["models"][number]) => void;
  onRemove?: () => void;
}) {
  const artField = `models.${model.modelNumber}.artUrl`;
  const soleField = `models.${model.modelNumber}.soleColor`;
  const adultGradeField = `models.${model.modelNumber}.adultGrade`;
  const childGradeField = `models.${model.modelNumber}.childGrade`;
  const artError = fieldErrors.get(artField);
  const soleError = fieldErrors.get(soleField);
  const adultGradeError = fieldErrors.get(adultGradeField);
  const childGradeError = fieldErrors.get(childGradeField);
  const updateAdultGrade = (optionId: string, value: string) => {
    onChange({
      ...model,
      adultGrade: { ...model.adultGrade, [optionId]: value },
    });
  };
  const updateChildGrade = (optionId: string, value: string) => {
    onChange({
      ...model,
      childGrade: { ...model.childGrade, [optionId]: value },
    });
  };

  return (
    <div className="space-y-5 rounded-xl border bg-muted/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">Modelo {model.modelNumber}</p>
          <p className="text-xs text-muted-foreground">
            Arte aprovada e distribuição da grade
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline">Modelo {model.modelNumber}</Badge>
          {onRemove ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
              onClick={onRemove}
            >
              <Trash2 />
              Excluir modelo
            </Button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`sole-${model.modelNumber}`}>
          Cor do solado modelo {model.modelNumber}
        </Label>
        <Select
          value={model.soleColor}
          onValueChange={(soleColor) => onChange({ ...model, soleColor })}
        >
          <SelectTrigger
            id={`sole-${model.modelNumber}`}
            className={cn(soleError && INVALID_FIELD_CLASS)}
            aria-invalid={Boolean(soleError)}
            aria-describedby={soleError ? `${soleField}-error` : undefined}
          >
            <SelectValue placeholder="Selecione a cor do solado" />
          </SelectTrigger>
          <SelectContent>
            {definition.soleOptions.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError id={`${soleField}-error`} message={soleError} />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`art-${model.modelNumber}`}>
          Artes aprovadas modelo {model.modelNumber}
        </Label>
        <Input
          id={`art-${model.modelNumber}`}
          className={cn(artError && INVALID_FIELD_CLASS)}
          aria-invalid={Boolean(artError)}
          aria-describedby={artError ? `${artField}-error` : undefined}
          type="url"
          value={model.artUrl}
          onChange={(event) =>
            onChange({ ...model, artUrl: event.target.value })
          }
          placeholder="https://drive.google.com/..."
        />
        <FieldError id={`${artField}-error`} message={artError} />
      </div>

      <GradeFields
        label={`Grade modelo ${model.modelNumber} adulto`}
        fieldId={adultGradeField}
        error={adultGradeError}
        options={definition.adultOptions}
        values={model.adultGrade}
        onChange={updateAdultGrade}
      />

      <div className="flex items-center gap-2 rounded-lg border bg-background/70 p-3">
        <Checkbox
          id={`child-model-${model.modelNumber}`}
          checked={model.hasChild}
          onCheckedChange={(checked) =>
            onChange({ ...model, hasChild: checked === true })
          }
        />
        <Label
          htmlFor={`child-model-${model.modelNumber}`}
          className="cursor-pointer"
        >
          Tem modelo infantil
        </Label>
      </div>

      {model.hasChild ? (
        <GradeFields
          label={`Grade modelo ${model.modelNumber} infantil`}
          fieldId={childGradeField}
          error={childGradeError}
          options={definition.childOptions}
          values={model.childGrade}
          onChange={updateChildGrade}
        />
      ) : null}
    </div>
  );
}

function FieldSection({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof Palette;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-5 rounded-xl border p-4 sm:p-5">
      <legend className="px-2">
        <span className="flex items-center gap-2 font-semibold">
          <Icon className="h-4 w-4 text-primary" />
          {title}
        </span>
      </legend>
      <p className="-mt-2 text-xs text-muted-foreground">{description}</p>
      {children}
    </fieldset>
  );
}

export function OrderRegistrationCard({
  opportunity,
  config,
  mode,
  onSaved,
  onEdit,
  onCancel,
  restoredDraft,
  onDraftChange,
}: {
  opportunity: OrderRegistrationOpportunity;
  config: OrderRegistrationConfig;
  mode: "summary" | "editor";
  onSaved: (opportunity: OrderRegistrationOpportunity) => void;
  onEdit?: () => void;
  onCancel?: () => void;
  restoredDraft?: OrderRegistrationDraft | null;
  onDraftChange?: (draft: OrderRegistrationDraft) => void;
}) {
  const [draft, setDraft] = useState<OrderRegistrationDraft>(() =>
    restoredDraft ?? createOrderRegistrationDraft(opportunity),
  );
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [serverIssues, setServerIssues] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const restoredDraftRef = useRef(restoredDraft);
  restoredDraftRef.current = restoredDraft;

  useEffect(() => {
    setDraft(
      restoredDraftRef.current ?? createOrderRegistrationDraft(opportunity),
    );
    setSelectedFiles([]);
    setServerIssues([]);
    setShowIssues(false);
  }, [opportunity]);

  const validationIssues = useMemo(
    () =>
      getOrderRegistrationValidationIssues(
        draft,
        config,
        opportunity.paymentProofs.length + selectedFiles.length,
      ),
    [config, draft, opportunity.paymentProofs.length, selectedFiles.length],
  );
  const issues = useMemo(
    () => validationIssues.map((issue) => issue.message),
    [validationIssues],
  );
  const fieldErrors = useMemo(() => {
    const errors = new Map<string, string>();
    if (!showIssues) return errors;
    for (const issue of validationIssues) {
      if (!errors.has(issue.field)) {
        errors.set(issue.field, issue.message);
      }
    }
    return errors;
  }, [showIssues, validationIssues]);
  const displayedIssues = serverIssues.length > 0 ? serverIssues : issues;
  const companyPaysFreight = /empresa/i.test(draft.freightCondition);
  const paysByCard = /cartão/i.test(draft.paymentForm);
  const errorFor = (field: string) => fieldErrors.get(field);
  const freightValueField = companyPaysFreight
    ? "freightCompanyValue"
    : "freightClientValue";
  const nextDefinition = config.modelDefinitions.find(
    (definition) => definition.modelNumber === draft.models.length + 1,
  );
  const remainingFileSlots =
    config.maxPaymentProofs -
    opportunity.paymentProofs.length -
    selectedFiles.length;

  const updateDraft = (update: Partial<OrderRegistrationDraft>) => {
    const updatedDraft = { ...draft, ...update };
    setDraft(updatedDraft);
    onDraftChange?.(updatedDraft);
    setServerIssues([]);
  };

  const updateModel = (
    modelNumber: number,
    updatedModel: OrderRegistrationDraft["models"][number],
  ) => {
    updateDraft({
      models: draft.models.map((model) =>
        model.modelNumber === modelNumber ? updatedModel : model,
      ),
    });
  };

  const addModel = () => {
    if (!nextDefinition) return;
    updateDraft({
      models: [
        ...draft.models,
        blankOrderRegistrationModel(nextDefinition),
      ],
    });
  };

  const removeModel = (modelNumber: number) => {
    if (modelNumber <= 1) return;
    const remainingModels = draft.models.filter(
      (model) => model.modelNumber !== modelNumber,
    );
    const models = remainingModels.map((model, index) => {
      const sourceDefinition = config.modelDefinitions.find(
        (definition) => definition.modelNumber === model.modelNumber,
      );
      const targetDefinition = config.modelDefinitions.find(
        (definition) => definition.modelNumber === index + 1,
      );
      return sourceDefinition && targetDefinition
        ? remapModelToDefinition(
            model,
            sourceDefinition,
            targetDefinition,
          )
        : model;
    });
    updateDraft({ models });
    setServerIssues([]);
  };

  const selectFiles = (files: FileList | null) => {
    if (!files) return;
    const available = Math.max(0, remainingFileSlots);
    const nextFiles = Array.from(files).slice(0, available);
    if (files.length > available) {
      toast.error(
        `O GHL aceita no máximo ${config.maxPaymentProofs} comprovantes.`,
      );
    }
    setSelectedFiles((current) => [...current, ...nextFiles]);
    setServerIssues([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeSelectedFile = (index: number) => {
    setSelectedFiles((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setShowIssues(true);
    setServerIssues([]);
    if (issues.length > 0) {
      requestAnimationFrame(() => {
        const firstInvalid = formRef.current?.querySelector<HTMLElement>(
          'input[aria-invalid="true"], button[aria-invalid="true"]',
        );
        firstInvalid?.focus();
        firstInvalid?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      toast.error("Revise as pendências antes de salvar.");
      return;
    }

    setSaving(true);
    try {
      const body = new FormData();
      body.set("payload", JSON.stringify(draft));
      selectedFiles.forEach((file) => body.append("files", file, file.name));
      const response = await fetch(
        `/api/cadastro-pedido/${opportunity.id}`,
        {
          method: "PUT",
          body,
        },
      );
      const result = (await response.json()) as SaveResponse;
      if (!response.ok || !result.opportunity) {
        setServerIssues(result.issues ?? []);
        throw new Error(result.error || "Não foi possível salvar o pedido.");
      }
      onSaved(result.opportunity);
      setDraft(createOrderRegistrationDraft(result.opportunity));
      setSelectedFiles([]);
      setShowIssues(false);
      toast.success("Pedido salvo no GHL.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar o pedido.",
      );
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => {
    setDraft(createOrderRegistrationDraft(opportunity));
    setSelectedFiles([]);
    setServerIssues([]);
    setShowIssues(false);
    onCancel?.();
  };

  const isWon = opportunity.status?.toLowerCase() === "won";

  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden border-l-4 py-0",
        orderTypeAccentClass(opportunity.orderType),
      )}
    >
      <CardHeader
        className={cn(
          "gap-4 border-b py-6",
          isWon
            ? "border-emerald-300/80 bg-emerald-100/80 dark:border-emerald-800 dark:bg-emerald-950/60"
            : "border-sky-300/80 bg-sky-100/80 dark:border-sky-800 dark:bg-sky-950/60",
        )}
      >
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="truncate text-lg">
                {opportunity.name}
              </CardTitle>
              <Badge
                className={
                  isWon
                    ? "bg-emerald-600 text-white hover:bg-emerald-600"
                    : "bg-sky-600 text-white hover:bg-sky-600"
                }
              >
                {isWon ? "GANHO" : "ABERTO"}
              </Badge>
              <Badge
                variant={issues.length === 0 ? "default" : "outline"}
                className={
                  issues.length === 0
                    ? "bg-primary text-primary-foreground"
                    : "border-amber-400 bg-amber-100 text-amber-950 hover:bg-amber-100 dark:border-amber-500/70 dark:bg-amber-900 dark:text-amber-50"
                }
              >
                {issues.length === 0
                  ? "Cadastro completo"
                  : `${issues.length} pendência(s)`}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <UserRound className="h-3.5 w-3.5" />
                {opportunity.contact.name || "Contato não informado"}
              </span>
              {opportunity.contact.email ? (
                <span>{opportunity.contact.email}</span>
              ) : null}
              {opportunity.contact.phone ? (
                <span>{opportunity.contact.phone}</span>
              ) : null}
            </div>
            <div className="mt-2">
              <Badge
                variant="outline"
                className={orderTypeBadgeClass(opportunity.orderType)}
                title="Tipo de pedido"
              >
                {opportunity.orderType || "Tipo não informado"}
              </Badge>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={`https://app.gohighlevel.com/v2/location/${GHL_LOCATION_ID}/opportunities/${opportunity.id}?tab=Detalhes+da+oportunidade`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink />
                Abrir no GHL
              </a>
            </Button>
            {mode === "summary" ? (
              <Button
                type="button"
                size="sm"
                onClick={onEdit}
                disabled={!onEdit}
              >
                <PencilLine />
                Editar pedido
              </Button>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border/60 bg-background/20">
          <div className="grid min-w-[720px] grid-cols-4 divide-x divide-border/60 px-4">
            <SummaryField
              label="Data de embarque"
              value={formatDateInput(opportunity.embarkDate)}
              icon={CalendarDays}
            />
            <SummaryField
              label="Valor"
              value={formatMoney(opportunity.monetaryValue)}
              icon={CircleDollarSign}
            />
            <SummaryField
              label="Vendedor"
              value={opportunity.seller || "Não informado"}
              icon={UserRound}
            />
            <SummaryField
              label="Designer responsável"
              value={opportunity.designer || "Não informado"}
              icon={Palette}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <span>
            <strong className="font-medium text-foreground">
              Quantidade de pares:
            </strong>{" "}
            {opportunity.quantityPairs ?? "Não informada"}
          </span>
          <span>
            <strong className="font-medium text-foreground">Fonte:</strong>{" "}
            {opportunity.source || "Não informada"}
          </span>
          <span>
            <strong className="font-medium text-foreground">Criado em:</strong>{" "}
            {formatDateTime(opportunity.createdAt)}
          </span>
          <span>
            <strong className="font-medium text-foreground">
              Atualizado em:
            </strong>{" "}
            {formatDateTime(opportunity.updatedAt)}
          </span>
        </div>
      </CardHeader>

      {mode === "editor" ? (
        <CardContent className="bg-background/60 py-6">
          <form
            ref={formRef}
            className="space-y-6"
            noValidate
            onSubmit={save}
          >
            <FieldSection
              icon={ReceiptText}
              title="Dados principais"
              description="Informações que identificam e totalizam o pedido."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`opportunity-name-${opportunity.id}`}>
                    Nome da oportunidade
                  </Label>
                  <Input
                    id={`opportunity-name-${opportunity.id}`}
                    className={cn(errorFor("opportunityName") && INVALID_FIELD_CLASS)}
                    aria-invalid={Boolean(errorFor("opportunityName"))}
                    aria-describedby={errorFor("opportunityName") ? `opportunity-name-${opportunity.id}-error` : undefined}
                    value={draft.opportunityName}
                    onChange={(event) =>
                      updateDraft({ opportunityName: event.target.value })
                    }
                    placeholder="Nome da oportunidade"
                  />
                  <FieldError
                    id={`opportunity-name-${opportunity.id}-error`}
                    message={errorFor("opportunityName")}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`seller-${opportunity.id}`}>Vendedor</Label>
                  <Input
                    id={`seller-${opportunity.id}`}
                    className={cn(errorFor("seller") && INVALID_FIELD_CLASS)}
                    aria-invalid={Boolean(errorFor("seller"))}
                    aria-describedby={errorFor("seller") ? `seller-${opportunity.id}-error` : undefined}
                    value={draft.seller}
                    onChange={(event) =>
                      updateDraft({ seller: event.target.value })
                    }
                    placeholder="Nome do vendedor"
                  />
                  <FieldError
                    id={`seller-${opportunity.id}-error`}
                    message={errorFor("seller")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`order-type-${opportunity.id}`}>Tipo de pedido</Label>
                  <Select
                    value={draft.orderType}
                    onValueChange={(value) =>
                      updateDraft({ orderType: value })
                    }
                  >
                    <SelectTrigger
                      id={`order-type-${opportunity.id}`}
                      className={cn(
                        "w-full",
                        errorFor("orderType") && INVALID_FIELD_CLASS,
                      )}
                      aria-invalid={Boolean(errorFor("orderType"))}
                      aria-describedby={errorFor("orderType") ? `order-type-${opportunity.id}-error` : undefined}
                    >
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {config.orderTypes.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    id={`order-type-${opportunity.id}-error`}
                    message={errorFor("orderType")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`embark-${opportunity.id}`}>
                    Data de embarque
                  </Label>
                  <Input
                    id={`embark-${opportunity.id}`}
                    className={cn(errorFor("embarkDate") && INVALID_FIELD_CLASS)}
                    aria-invalid={Boolean(errorFor("embarkDate"))}
                    aria-describedby={errorFor("embarkDate") ? `embark-${opportunity.id}-error` : undefined}
                    type="date"
                    value={draft.embarkDate}
                    onChange={(event) =>
                      updateDraft({ embarkDate: event.target.value })
                    }
                  />
                  <FieldError
                    id={`embark-${opportunity.id}-error`}
                    message={errorFor("embarkDate")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`value-${opportunity.id}`}>
                    Valor do pedido
                  </Label>
                  <Input
                    id={`value-${opportunity.id}`}
                    className={cn(errorFor("monetaryValue") && INVALID_FIELD_CLASS)}
                    aria-invalid={Boolean(errorFor("monetaryValue"))}
                    aria-describedby={errorFor("monetaryValue") ? `value-${opportunity.id}-error` : undefined}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={draft.monetaryValue}
                    onChange={(event) =>
                      updateDraft({ monetaryValue: event.target.value })
                    }
                    placeholder="0,00"
                  />
                  <FieldError
                    id={`value-${opportunity.id}-error`}
                    message={errorFor("monetaryValue")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`designer-${opportunity.id}`}>
                    Designer responsável
                  </Label>
                  <Input
                    id={`designer-${opportunity.id}`}
                    className={cn(errorFor("designer") && INVALID_FIELD_CLASS)}
                    aria-invalid={Boolean(errorFor("designer"))}
                    aria-describedby={errorFor("designer") ? `designer-${opportunity.id}-error` : undefined}
                    value={draft.designer}
                    onChange={(event) =>
                      updateDraft({ designer: event.target.value })
                    }
                    placeholder="Nome do designer"
                  />
                  <FieldError
                    id={`designer-${opportunity.id}-error`}
                    message={errorFor("designer")}
                  />
                </div>
              </div>
            </FieldSection>

            <FieldSection
              icon={Palette}
              title="Grade do pedido"
              description="As quantidades são salvas pelos UUIDs internos de cada linha do GHL."
            >
              <div className="space-y-4">
                {draft.models.map((model) => {
                  const definition = config.modelDefinitions.find(
                    (item) => item.modelNumber === model.modelNumber,
                  );
                  return definition ? (
                    <ModelFields
                      key={model.modelNumber}
                      definition={definition}
                      model={model}
                      fieldErrors={fieldErrors}
                      onChange={(updatedModel) =>
                        updateModel(model.modelNumber, updatedModel)
                      }
                      onRemove={
                        model.modelNumber > 1
                          ? () => removeModel(model.modelNumber)
                          : undefined
                      }
                    />
                  ) : null;
                })}
                {nextDefinition ? (
                  <Button type="button" variant="outline" onClick={addModel}>
                    <Plus />
                    Adicionar modelo {nextDefinition.modelNumber}
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Limite de {config.modelDefinitions.length} modelos atingido.
                  </p>
                )}
              </div>
            </FieldSection>

            <FieldSection
              icon={CircleDollarSign}
              title="Informações de preço/par"
              description="A soma das grades deve fechar com a quantidade total e com o valor do pedido."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor={`pairs-${opportunity.id}`}>
                    Quantidade de pares
                  </Label>
                  <Input
                    id={`pairs-${opportunity.id}`}
                    className={cn(errorFor("quantityPairs") && INVALID_FIELD_CLASS)}
                    aria-invalid={Boolean(errorFor("quantityPairs"))}
                    aria-describedby={errorFor("quantityPairs") ? `pairs-${opportunity.id}-error` : undefined}
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={draft.quantityPairs}
                    onChange={(event) =>
                      updateDraft({ quantityPairs: event.target.value })
                    }
                    placeholder="0"
                  />
                  <FieldError
                    id={`pairs-${opportunity.id}-error`}
                    message={errorFor("quantityPairs")}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`unit-${opportunity.id}`}>
                    Valor unitário do par
                  </Label>
                  <Input
                    id={`unit-${opportunity.id}`}
                    className={cn(errorFor("unitPrice") && INVALID_FIELD_CLASS)}
                    aria-invalid={Boolean(errorFor("unitPrice"))}
                    aria-describedby={errorFor("unitPrice") ? `unit-${opportunity.id}-error` : undefined}
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={draft.unitPrice}
                    onChange={(event) =>
                      updateDraft({ unitPrice: event.target.value })
                    }
                    placeholder="0,00"
                  />
                  <FieldError
                    id={`unit-${opportunity.id}-error`}
                    message={errorFor("unitPrice")}
                  />
                </div>
              </div>
            </FieldSection>

            <FieldSection
              icon={Truck}
              title="Frete"
              description="O campo de valor muda conforme quem paga o frete."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor={`freight-condition-${opportunity.id}`}>Condição do frete</Label>
                  <Select
                    value={draft.freightCondition}
                    onValueChange={(value) =>
                      updateDraft({ freightCondition: value })
                    }
                  >
                    <SelectTrigger
                      id={`freight-condition-${opportunity.id}`}
                      className={cn(
                        "w-full",
                        errorFor("freightCondition") && INVALID_FIELD_CLASS,
                      )}
                      aria-invalid={Boolean(errorFor("freightCondition"))}
                      aria-describedby={errorFor("freightCondition") ? `freight-condition-${opportunity.id}-error` : undefined}
                    >
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {config.freightConditions.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    id={`freight-condition-${opportunity.id}-error`}
                    message={errorFor("freightCondition")}
                  />
                </div>
                {draft.freightCondition ? (
                  <div className="space-y-2">
                    <Label
                      htmlFor={`freight-value-${opportunity.id}`}
                    >
                      {companyPaysFreight
                        ? "Valor do Frete Pago Hudlab"
                        : "Valor do Frete Pago Cliente"}
                    </Label>
                    <Input
                      id={`freight-value-${opportunity.id}`}
                      className={cn(errorFor(freightValueField) && INVALID_FIELD_CLASS)}
                      aria-invalid={Boolean(errorFor(freightValueField))}
                      aria-describedby={errorFor(freightValueField) ? `freight-value-${opportunity.id}-error` : undefined}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={
                        companyPaysFreight
                          ? draft.freightCompanyValue
                          : draft.freightClientValue
                      }
                      onChange={(event) =>
                        updateDraft(
                          companyPaysFreight
                            ? {
                                freightCompanyValue: event.target.value,
                              }
                            : {
                                freightClientValue: event.target.value,
                              },
                        )
                      }
                      placeholder="0,00"
                    />
                    <FieldError
                      id={`freight-value-${opportunity.id}-error`}
                      message={errorFor(freightValueField)}
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor={`carrier-${opportunity.id}`}>
                    Transportadora
                  </Label>
                  <Input
                    id={`carrier-${opportunity.id}`}
                    className={cn(errorFor("carrier") && INVALID_FIELD_CLASS)}
                    aria-invalid={Boolean(errorFor("carrier"))}
                    aria-describedby={errorFor("carrier") ? `carrier-${opportunity.id}-error` : undefined}
                    value={draft.carrier}
                    onChange={(event) =>
                      updateDraft({ carrier: event.target.value })
                    }
                    placeholder="Nome da transportadora"
                  />
                  <FieldError
                    id={`carrier-${opportunity.id}-error`}
                    message={errorFor("carrier")}
                  />
                </div>
              </div>
            </FieldSection>

            <FieldSection
              icon={ReceiptText}
              title="Pagamento"
              description="As opções de boleto ficam ocultas; cartão exige os dados complementares."
            >
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor={`payment-form-${opportunity.id}`}>Forma de pagamento</Label>
                  <Select
                    value={
                      config.paymentForms.includes(draft.paymentForm)
                        ? draft.paymentForm
                        : ""
                    }
                    onValueChange={(value) =>
                      updateDraft({ paymentForm: value })
                    }
                  >
                    <SelectTrigger
                      id={`payment-form-${opportunity.id}`}
                      className={cn(
                        "w-full",
                        errorFor("paymentForm") && INVALID_FIELD_CLASS,
                      )}
                      aria-invalid={Boolean(errorFor("paymentForm"))}
                      aria-describedby={errorFor("paymentForm") ? `payment-form-${opportunity.id}-error` : undefined}
                    >
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      {config.paymentForms.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FieldError
                    id={`payment-form-${opportunity.id}-error`}
                    message={errorFor("paymentForm")}
                  />
                </div>
                {paysByCard ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor={`card-brand-${opportunity.id}`}>Bandeira do cartão</Label>
                      <Select
                        value={draft.cardBrand}
                        onValueChange={(value) =>
                          updateDraft({ cardBrand: value })
                        }
                      >
                        <SelectTrigger
                          id={`card-brand-${opportunity.id}`}
                          className={cn(
                            "w-full",
                            errorFor("cardBrand") && INVALID_FIELD_CLASS,
                          )}
                          aria-invalid={Boolean(errorFor("cardBrand"))}
                          aria-describedby={errorFor("cardBrand") ? `card-brand-${opportunity.id}-error` : undefined}
                        >
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {config.cardBrands.map((option) => (
                            <SelectItem key={option} value={option}>
                              {option}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FieldError
                        id={`card-brand-${opportunity.id}-error`}
                        message={errorFor("cardBrand")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`installments-${opportunity.id}`}>
                        Parcelamento (vezes)
                      </Label>
                      <Input
                        id={`installments-${opportunity.id}`}
                        className={cn(errorFor("cardInstallments") && INVALID_FIELD_CLASS)}
                        aria-invalid={Boolean(errorFor("cardInstallments"))}
                        aria-describedby={errorFor("cardInstallments") ? `installments-${opportunity.id}-error` : undefined}
                        type="number"
                        min="1"
                        step="1"
                        inputMode="numeric"
                        value={draft.cardInstallments}
                        onChange={(event) =>
                          updateDraft({
                            cardInstallments: event.target.value,
                          })
                        }
                        placeholder="1"
                      />
                      <FieldError
                        id={`installments-${opportunity.id}-error`}
                        message={errorFor("cardInstallments")}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`card-date-${opportunity.id}`}>
                        Data da venda no cartão
                      </Label>
                      <Input
                        id={`card-date-${opportunity.id}`}
                        className={cn(errorFor("cardSaleDate") && INVALID_FIELD_CLASS)}
                        aria-invalid={Boolean(errorFor("cardSaleDate"))}
                        aria-describedby={errorFor("cardSaleDate") ? `card-date-${opportunity.id}-error` : undefined}
                        type="date"
                        value={draft.cardSaleDate}
                        onChange={(event) =>
                          updateDraft({ cardSaleDate: event.target.value })
                        }
                      />
                      <FieldError
                        id={`card-date-${opportunity.id}-error`}
                        message={errorFor("cardSaleDate")}
                      />
                    </div>
                  </>
                ) : null}
              </div>

              <div
                className={cn(
                  "space-y-3 rounded-xl border bg-muted/10 p-4",
                  errorFor("paymentProofs") && "border-destructive bg-destructive/5",
                )}
                aria-invalid={Boolean(errorFor("paymentProofs"))}
                aria-describedby={errorFor("paymentProofs") ? `payment-proofs-${opportunity.id}-error` : undefined}
              >
                <div>
                  <p className="text-sm font-medium">
                    Comprovante de pagamento
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Até {config.maxPaymentProofs} arquivos; máximo de 50 MB por
                    arquivo.
                  </p>
                </div>

                {opportunity.paymentProofs.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {opportunity.paymentProofs.map((proof, index) => (
                      <a
                        key={`${proof.url}-${index}`}
                        href={proof.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex min-w-0 items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:bg-muted/40"
                      >
                        <FileCheck2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {proof.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatFileSize(proof.size)}
                          </span>
                        </span>
                        <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                      </a>
                    ))}
                  </div>
                ) : null}

                {selectedFiles.length > 0 ? (
                  <div className="grid gap-2 md:grid-cols-2">
                    {selectedFiles.map((file, index) => (
                      <div
                        key={`${file.name}-${file.size}-${index}`}
                        className="flex min-w-0 items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-3"
                      >
                        <Upload className="h-4 w-4 shrink-0 text-primary" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">
                            {file.name}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {formatFileSize(file.size)}
                          </span>
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSelectedFile(index)}
                        >
                          Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div>
                  <Input
                    ref={fileInputRef}
                    className={cn(errorFor("paymentProofs") && INVALID_FIELD_CLASS)}
                    aria-invalid={Boolean(errorFor("paymentProofs"))}
                    aria-describedby={errorFor("paymentProofs") ? `payment-proofs-${opportunity.id}-error` : undefined}
                    type="file"
                    multiple
                    accept={PAYMENT_PROOF_ACCEPT}
                    disabled={remainingFileSlots <= 0}
                    onChange={(event) => selectFiles(event.target.files)}
                    aria-label="Adicionar comprovantes de pagamento"
                  />
                  {remainingFileSlots <= 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">
                      O limite de comprovantes foi atingido.
                    </p>
                  ) : null}
                </div>
                <FieldError
                  id={`payment-proofs-${opportunity.id}-error`}
                  message={errorFor("paymentProofs")}
                />
              </div>
            </FieldSection>

            {showIssues && displayedIssues.length > 0 ? (
              <Alert variant="destructive">
                <TriangleAlert />
                <AlertTitle>
                  {displayedIssues.length} pendência(s) para salvar
                </AlertTitle>
                <AlertDescription>
                  <ul className="list-inside list-disc space-y-1">
                    {displayedIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : issues.length === 0 ? (
              <Alert variant="success">
                <CheckCircle2 />
                <AlertTitle>Cadastro pronto para salvar</AlertTitle>
                <AlertDescription>
                  Grades, valores, frete, pagamento e comprovantes estão
                  consistentes.
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-col justify-between gap-3 rounded-xl border bg-muted/20 p-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-sm font-medium">
                  {issues.length === 0
                    ? "Tudo conferido"
                    : `${issues.length} pendência(s) detectada(s)`}
                </p>
                <p className="text-xs text-muted-foreground">
                  O servidor fará a mesma validação antes de atualizar o GHL.
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={cancel}
                >
                  <X />
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? <Loader2 className="animate-spin" /> : <Save />}
                  {saving ? "Salvando no GHL…" : "Salvar pedido"}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      ) : null}
    </Card>
  );
}
