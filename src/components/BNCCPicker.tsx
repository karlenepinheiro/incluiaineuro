// components/BNCCPicker.tsx
import React, { useMemo, useState } from "react";
import { Search, Plus, X } from "lucide-react";

type Props = {
  availableCodes: string[];
  selectedCodes: string[];
  onChange: (codes: string[]) => void;
  hint?: string;
};

export const BNCCPicker: React.FC<Props> = ({ availableCodes, selectedCodes, onChange, hint }) => {
  const [q, setQ] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [manual, setManual] = useState("");

  const filtered = useMemo(() => {
    const qq = q.trim().toUpperCase();
    const base = qq ? availableCodes.filter((c) => c.includes(qq)) : availableCodes;
    return showAll ? base : base.slice(0, 14);
  }, [availableCodes, q, showAll]);

  const add = (code: string) => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    if (selectedCodes.includes(c)) return;
    onChange([...selectedCodes, c]);
  };

  const remove = (code: string) => {
    onChange(selectedCodes.filter((c) => c !== code));
  };

  return (
    <div className="border rounded-xl p-3">
      {/* Selected chips */}
      <div className="flex flex-wrap gap-2 mb-3">
        {selectedCodes.length === 0 ? (
          <div className="text-sm text-gray-400">Nenhuma seleção...</div>
        ) : (
          selectedCodes.map((c) => (
            <button
              key={c}
              onClick={() => remove(c)}
              className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-2"
              title="Remover"
            >
              {c} <X size={14} />
            </button>
          ))
        )}
      </div>

      {/* Search + manual add */}
      <div className="grid grid-cols-12 gap-2 mb-3">
        <div className="col-span-7 relative">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar código (ex: EF03MA...)"
            className="w-full border rounded-lg pl-9 pr-3 py-2"
          />
        </div>
        <div className="col-span-4">
          <input
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="Adicionar..."
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
        <button
          className="col-span-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center"
          onClick={() => {
            add(manual);
            setManual("");
          }}
          title="Adicionar"
        >
          <Plus size={18} />
        </button>
      </div>

      {/* Available codes */}
      {availableCodes.length === 0 ? (
        <div className="text-sm text-gray-500">Nenhum código encontrado para esta disciplina/série.</div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {filtered.map((code) => {
            const active = selectedCodes.includes(code);
            return (
              <button
                key={code}
                onClick={() => (active ? remove(code) : add(code))}
                className={`px-3 py-1 rounded-full border text-xs font-bold ${
                  active ? "bg-emerald-600 text-white border-emerald-700" : "bg-white text-gray-800 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {code}
              </button>
            );
          })}

          {availableCodes.length > 14 && (
            <button
              className="px-3 py-1 rounded-full border border-dashed text-xs font-bold text-gray-700 hover:bg-gray-50"
              onClick={() => setShowAll((v) => !v)}
            >
              {showAll ? "Mostrar menos" : "Mostrar mais"}
            </button>
          )}
        </div>
      )}

      {hint && <div className="text-xs text-gray-500 mt-3">{hint}</div>}
    </div>
  );
};