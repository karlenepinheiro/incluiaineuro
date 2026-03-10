import React from "react";

export type WorksheetItemType = "mcq" | "match" | "fill" | "tf" | "short" | "draw";

export interface WorksheetItem {
  type: WorksheetItemType;
  number: number;
  prompt: string;
  options?: string[];
  answerArea?: "lines" | "box" | "grid" | "none";
  hasImage?: boolean;
  imagePrompt?: string;
  /** Optional: resolved image URL/base64 injected later */
  imageUrl?: string;
  difficulty?: "baixo" | "medio" | "alto";
  supports?: string[];
}

export interface WorksheetSection {
  heading: string;
  instructions?: string;
  items: WorksheetItem[];
}

export interface WorksheetDoc {
  meta: {
    title: string;
    discipline?: string;
    grade?: string;
    period?: string;
    bncc?: string[];
    estimatedMinutes?: number;
  };
  teacherBox?: {
    objective?: string[];
    materials?: string[];
    steps?: string[];
    tips?: string[];
  };
  studentSheet: {
    intro?: string;
    sections: WorksheetSection[];
  };
  assessment?: {
    checklist?: string[];
    rubric?: Array<{ criterion: string; levels: string[]; notes?: string }>;
  };
  adaptations?: {
    level1?: string[];
    level2?: string[];
    level3?: string[];
  };
}

export function safeParseWorksheet(input: string): WorksheetDoc | null {
  try {
    const parsed = JSON.parse(input);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.meta || !parsed.studentSheet) return null;
    if (!Array.isArray(parsed.studentSheet.sections)) return null;
    return parsed as WorksheetDoc;
  } catch {
    return null;
  }
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-1 text-[11px] font-bold text-gray-700">
      {children}
    </span>
  );
}

function AnswerArea({ kind = "lines" }: { kind?: "lines" | "box" | "grid" | "none" }) {
  if (kind === "none") return null;
  if (kind === "box") {
    return <div className="mt-2 h-24 w-full rounded-lg border border-gray-300" />;
  }
  if (kind === "grid") {
    return (
      <div
        className="mt-2 h-24 w-full rounded-lg border border-gray-300"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(17,24,39,.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(17,24,39,.10) 1px, transparent 1px)",
          backgroundSize: "14px 14px",
        }}
      />
    );
  }
  // lines
  return (
    <div className="mt-2 space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-5 w-full border-b border-gray-300" />
      ))}
    </div>
  );
}

function ItemCard({ item }: { item: WorksheetItem }) {
  return (
    <div className="avoid-break rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-sm font-black text-white">
            {item.number}
          </div>
          <div>
            <div className="text-sm font-semibold text-gray-900">{item.prompt}</div>
            {(item.supports?.length || 0) > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {item.supports!.slice(0, 6).map((s) => (
                  <Chip key={s}>{s}</Chip>
                ))}
              </div>
            )}
          </div>
        </div>
        {item.difficulty && <Chip>{item.difficulty}</Chip>}
      </div>

      {item.hasImage && (
        <div className="mt-3 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3">
          {item.imageUrl ? (
            <img src={item.imageUrl} className="h-40 w-full object-contain" />
          ) : (
            <div className="text-xs text-gray-600">
              <div className="font-bold">Espaço para imagem</div>
              {item.imagePrompt ? <div className="mt-1">Prompt: {item.imagePrompt}</div> : null}
            </div>
          )}
        </div>
      )}

      {item.type === "mcq" && (item.options?.length || 0) > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2">
          {item.options!.slice(0, 6).map((opt, idx) => (
            <div key={idx} className="flex items-start gap-2 rounded-lg border border-gray-200 p-2">
              <div className="mt-[2px] h-4 w-4 rounded-full border border-gray-400" />
              <div className="text-sm text-gray-800">{opt}</div>
            </div>
          ))}
        </div>
      )}

      {item.type === "tf" && (
        <div className="mt-3 flex gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <div className="h-4 w-4 rounded border border-gray-400" />
            <span className="text-sm">Verdadeiro</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
            <div className="h-4 w-4 rounded border border-gray-400" />
            <span className="text-sm">Falso</span>
          </div>
        </div>
      )}

      {item.type === "match" && (
        <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
          <div className="font-bold">Ligue as colunas:</div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-md border border-gray-200 bg-white p-2">A{i + 1} ____</div>
              ))}
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-md border border-gray-200 bg-white p-2">( {String.fromCharCode(97 + i)} )</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {item.type === "draw" && <div className="mt-3 h-40 w-full rounded-lg border border-gray-300" />}

      {item.type === "fill" || item.type === "short" ? <AnswerArea kind={item.answerArea || "lines"} /> : null}
    </div>
  );
}

export function WorksheetRenderer({ doc, studentName }: { doc: WorksheetDoc; studentName?: string }) {
  const bncc = doc.meta.bncc || [];
  return (
    <div className="worksheet-root">
      <div className="avoid-break rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-black uppercase tracking-wide text-purple-700">Atividade Adaptada</div>
            <h1 className="mt-1 text-xl font-black text-gray-900">{doc.meta.title || "Atividade"}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              {studentName ? <Chip>Aluno: {studentName}</Chip> : null}
              {doc.meta.discipline ? <Chip>{doc.meta.discipline}</Chip> : null}
              {doc.meta.grade ? <Chip>{doc.meta.grade}</Chip> : null}
              {doc.meta.period ? <Chip>{doc.meta.period}</Chip> : null}
              {typeof doc.meta.estimatedMinutes === "number" ? <Chip>{doc.meta.estimatedMinutes} min</Chip> : null}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-700">
            Data: ____/____/____
          </div>
        </div>

        {(bncc.length || 0) > 0 && (
          <div className="avoid-break mt-4 rounded-xl border border-purple-100 bg-purple-50 p-4">
            <div className="text-xs font-black uppercase text-purple-900">BNCC</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {bncc.map((c) => (
                <span key={c} className="inline-flex items-center rounded-full bg-white px-2 py-1 text-[11px] font-black text-purple-800 ring-1 ring-purple-200">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        {doc.studentSheet.intro ? (
          <div className="avoid-break mt-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="text-xs font-black uppercase text-gray-700">Instruções</div>
            <div className="mt-2 text-sm text-gray-800">{doc.studentSheet.intro}</div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 space-y-6">
        {doc.studentSheet.sections.map((section, idx) => (
          <div key={idx} className="avoid-break rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <div className="text-[11px] font-black uppercase tracking-wide text-gray-500">Seção</div>
            <h2 className="mt-1 text-lg font-black text-gray-900">{section.heading}</h2>
            {section.instructions ? <div className="mt-2 text-sm text-gray-700">{section.instructions}</div> : null}
            <div className="mt-4 space-y-3">
              {section.items.map((item) => (
                <ItemCard key={`${section.heading}-${item.number}`} item={item} />
              ))}
            </div>
          </div>
        ))}
      </div>

      {(doc.teacherBox || doc.assessment || doc.adaptations) && (
        <div className="page-break mt-6 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="text-[11px] font-black uppercase tracking-wide text-gray-500">Somente para o professor</div>
          <h2 className="mt-1 text-lg font-black text-gray-900">Orientações & Avaliação</h2>

          {doc.teacherBox && (
            <div className="mt-4 grid grid-cols-1 gap-4">
              {doc.teacherBox.objective?.length ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-black uppercase text-gray-700">Objetivos</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-gray-800">
                    {doc.teacherBox.objective.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {doc.teacherBox.materials?.length ? (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                  <div className="text-xs font-black uppercase text-gray-700">Materiais</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-gray-800">
                    {doc.teacherBox.materials.map((m, i) => (
                      <li key={i}>{m}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {doc.teacherBox.steps?.length ? (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-black uppercase text-gray-700">Passo a passo</div>
                  <ol className="mt-2 list-decimal pl-5 text-sm text-gray-800">
                    {doc.teacherBox.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                </div>
              ) : null}

              {doc.teacherBox.tips?.length ? (
                <div className="rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-black uppercase text-gray-700">Dicas</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-gray-800">
                    {doc.teacherBox.tips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          {doc.assessment?.checklist?.length ? (
            <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
              <div className="text-xs font-black uppercase text-gray-700">Checklist de evidências</div>
              <div className="mt-2 grid grid-cols-1 gap-2">
                {doc.assessment.checklist.map((c, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <div className="mt-[3px] h-4 w-4 rounded border border-gray-400" />
                    <div className="text-sm text-gray-800">{c}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {doc.adaptations && (
            <div className="mt-4 grid grid-cols-1 gap-4">
              {doc.adaptations.level1?.length ? (
                <div className="rounded-xl border border-green-100 bg-green-50 p-4">
                  <div className="text-xs font-black uppercase text-green-800">Adaptações – Nível 1</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-green-900">
                    {doc.adaptations.level1.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {doc.adaptations.level2?.length ? (
                <div className="rounded-xl border border-yellow-100 bg-yellow-50 p-4">
                  <div className="text-xs font-black uppercase text-yellow-800">Adaptações – Nível 2</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-yellow-900">
                    {doc.adaptations.level2.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {doc.adaptations.level3?.length ? (
                <div className="rounded-xl border border-red-100 bg-red-50 p-4">
                  <div className="text-xs font-black uppercase text-red-800">Adaptações – Nível 3</div>
                  <ul className="mt-2 list-disc pl-5 text-sm text-red-900">
                    {doc.adaptations.level3.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
