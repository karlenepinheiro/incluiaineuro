import React, { useState } from 'react';
import { X, Plus, Check } from 'lucide-react';

interface Props {
  label: string;
  options: string[];
  selected: string[];
  onChange: (selected: string[]) => void;
  placeholder?: string;
}

export const MultiSelect: React.FC<Props> = ({ label, options, selected, onChange, placeholder }) => {
  const [customInput, setCustomInput] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const toggleOption = (option: string) => {
    if (selected.includes(option)) {
      onChange(selected.filter(item => item !== option));
    } else {
      onChange([...selected, option]);
    }
  };

  const addCustom = () => {
    if (customInput.trim() && !selected.includes(customInput.trim())) {
      onChange([...selected, customInput.trim()]);
      setCustomInput('');
      setIsAdding(false);
    }
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-semibold text-gray-700 mb-2">{label}</label>
      
      {/* Selected Chips */}
      <div className="flex flex-wrap gap-2 mb-3 min-h-[38px] p-2 bg-gray-50 border border-gray-200 rounded-lg">
        {selected.length === 0 && <span className="text-gray-400 text-sm italic">Nenhuma seleção...</span>}
        {selected.map(item => (
          <span key={item} className="inline-flex items-center gap-1 bg-brand-100 text-brand-800 px-2 py-1 rounded-md text-sm font-medium">
            {item}
            <button type="button" onClick={() => toggleOption(item)} className="hover:text-brand-900"><X size={14}/></button>
          </span>
        ))}
      </div>

      {/* Options List */}
      <div className="flex flex-wrap gap-2 mb-2">
        {options.map(option => (
          <button
            key={option}
            type="button"
            onClick={() => toggleOption(option)}
            className={`px-3 py-1 rounded-full text-xs border transition flex items-center gap-1 ${
              selected.includes(option) 
                ? 'bg-brand-600 text-white border-brand-600' 
                : 'bg-white text-gray-600 border-gray-300 hover:border-brand-400'
            }`}
          >
            {selected.includes(option) && <Check size={12}/>}
            {option}
          </button>
        ))}
        
        {/* Add Custom Button */}
        {!isAdding ? (
          <button 
            type="button" 
            onClick={() => setIsAdding(true)}
            className="px-3 py-1 rounded-full text-xs border border-dashed border-gray-400 text-gray-600 hover:border-brand-500 hover:text-brand-600 flex items-center gap-1"
          >
            <Plus size={12}/> Outros
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <input 
              autoFocus
              className="text-xs border border-brand-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Digite..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustom())}
            />
            <button type="button" onClick={addCustom} className="text-brand-600 hover:text-brand-800"><Check size={16}/></button>
            <button type="button" onClick={() => setIsAdding(false)} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
          </div>
        )}
      </div>
    </div>
  );
};
