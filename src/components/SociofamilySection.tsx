import React, { useState, useRef } from 'react';
import { ChevronDown, ChevronUp, Users, Copy, Mic, MicOff } from 'lucide-react';
import {
  SociofamilyData,
  SociofamilyGuardian,
  SociofamilyGuardian2,
  SociofamilyAddress,
  TriState,
  DEFAULT_SOCIOFAMILY_DATA,
} from '../types';
import { maskCPF, maskCEP, maskPhone, maskDateBR, unmask, validateCPF } from '../utils/masks';

// ─── helpers ─────────────────────────────────────────────────────────────────

const UF_LIST = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG',
  'PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

async function fetchViaCEP(rawCep: string): Promise<Partial<SociofamilyAddress> | null> {
  if (rawCep.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
    if (!res.ok) return null;
    const d = await res.json();
    if (d.erro) return null;
    return {
      street:   d.logradouro || '',
      district: d.bairro     || '',
      city:     d.localidade || '',
      state:    d.uf         || '',
    };
  } catch {
    return null;
  }
}

// ─── subcomponents ────────────────────────────────────────────────────────────

interface TriRadioProps {
  label: string;
  value: TriState;
  onChange: (v: TriState) => void;
}
const TriRadio: React.FC<TriRadioProps> = ({ label, value, onChange }) => (
  <div>
    <span className="label">{label}</span>
    <div className="flex gap-3 mt-1">
      {(['yes', 'no', 'unknown'] as TriState[]).map(opt => (
        <label key={opt} className="flex items-center gap-1 cursor-pointer text-sm">
          <input
            type="radio"
            checked={value === opt}
            onChange={() => onChange(opt)}
            className="accent-teal-700"
          />
          {opt === 'yes' ? 'Sim' : opt === 'no' ? 'Não' : 'Não informado'}
        </label>
      ))}
    </div>
  </div>
);

interface AddressBlockProps {
  address: SociofamilyAddress;
  onChange: (addr: SociofamilyAddress) => void;
  cepSuffix: string; // unique suffix so IDs don't collide
}
const AddressBlock: React.FC<AddressBlockProps> = ({ address, onChange, cepSuffix }) => {
  const [loading, setLoading] = useState(false);
  const [cepErr, setCepErr] = useState('');

  const set = (field: keyof SociofamilyAddress, val: string) =>
    onChange({ ...address, [field]: val });

  const handleCEPBlur = async () => {
    const raw = unmask(address.cep);
    if (raw.length !== 8) return;
    setLoading(true);
    setCepErr('');
    const result = await fetchViaCEP(raw);
    setLoading(false);
    if (!result) {
      setCepErr('CEP não encontrado. Preencha o endereço manualmente.');
      return;
    }
    onChange({ ...address, ...result });
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
      <div>
        <label className="label">CEP</label>
        <div className="relative">
          <input
            id={`cep-${cepSuffix}`}
            value={address.cep}
            onChange={e => set('cep', maskCEP(e.target.value))}
            onBlur={handleCEPBlur}
            className="input-field pr-7"
            placeholder="00000-000"
            maxLength={9}
          />
          {loading && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-teal-700 animate-spin">⟳</span>
          )}
        </div>
        {cepErr && <p className="text-[10px] text-red-500 mt-1">{cepErr}</p>}
      </div>
      <div className="md:col-span-2">
        <label className="label">Logradouro</label>
        <input value={address.street} onChange={e => set('street', e.target.value)} className="input-field" placeholder="Rua, Av., Travessa..." />
      </div>
      <div>
        <label className="label">Número</label>
        <input value={address.number} onChange={e => set('number', e.target.value)} className="input-field" placeholder="Nº" />
      </div>
      <div>
        <label className="label">Complemento</label>
        <input value={address.complement} onChange={e => set('complement', e.target.value)} className="input-field" placeholder="Apto, Bloco..." />
      </div>
      <div>
        <label className="label">Bairro</label>
        <input value={address.district} onChange={e => set('district', e.target.value)} className="input-field" />
      </div>
      <div>
        <label className="label">Cidade</label>
        <input value={address.city} onChange={e => set('city', e.target.value)} className="input-field" />
      </div>
      <div>
        <label className="label">UF</label>
        <select value={address.state} onChange={e => set('state', e.target.value)} className="input-field">
          <option value="">Selecione</option>
          {UF_LIST.map(uf => <option key={uf} value={uf}>{uf}</option>)}
        </select>
      </div>
    </div>
  );
};

const RELATIONSHIP_OPTIONS = [
  '', 'Mãe', 'Pai', 'Avó', 'Avô', 'Tio/Tia', 'Responsável Legal', 'Outro',
];

interface GuardianBlockProps {
  label: string;
  data: SociofamilyGuardian | SociofamilyGuardian2;
  onChange: (g: SociofamilyGuardian | SociofamilyGuardian2) => void;
  showSameAddress?: boolean;
  onCopyAddress?: () => void;
}
const GuardianBlock: React.FC<GuardianBlockProps> = ({
  label, data, onChange, showSameAddress, onCopyAddress,
}) => {
  const [cpfError, setCpfError] = useState(false);

  const set = <K extends keyof typeof data>(field: K, val: any) =>
    onChange({ ...data, [field]: val } as typeof data);

  const isG2 = 'sameAddressAsGuardian1' in data;
  const g2 = data as SociofamilyGuardian2;

  const handleCPFChange = (raw: string) => {
    const masked = maskCPF(raw);
    set('cpf', masked);
    const digits = unmask(masked);
    // Valida apenas quando totalmente preenchido; apaga erro enquanto está digitando
    if (digits.length === 0) {
      setCpfError(false);
    } else if (digits.length === 11) {
      setCpfError(!validateCPF(digits));
    } else {
      setCpfError(false); // não atrapalha digitação parcial
    }
  };

  const handleCPFBlur = () => {
    const digits = unmask(data.cpf);
    if (digits.length > 0 && digits.length < 11) {
      setCpfError(true); // incompleto também é inválido
    } else if (digits.length === 11) {
      setCpfError(!validateCPF(digits));
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-5 space-y-4 bg-gray-50">
      <h4 className="font-semibold text-gray-700 text-sm">{label}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label">Vínculo com o aluno</label>
          <select value={data.relationship} onChange={e => set('relationship', e.target.value)} className="input-field">
            {RELATIONSHIP_OPTIONS.map(o => <option key={o} value={o}>{o || 'Selecione'}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Nome completo</label>
          <input value={data.fullName} onChange={e => set('fullName', e.target.value)} className="input-field" placeholder="Nome completo" />
        </div>
        <div>
          <label className="label">Data de nascimento</label>
          <input
            value={data.birthDate}
            onChange={e => set('birthDate', maskDateBR(e.target.value))}
            className="input-field"
            placeholder="dd/mm/aaaa"
            maxLength={10}
          />
        </div>
        <div>
          <label className="label">CPF</label>
          <input
            value={data.cpf}
            onChange={e => handleCPFChange(e.target.value)}
            onBlur={handleCPFBlur}
            className={`input-field font-mono${cpfError ? ' border-red-400 focus:border-red-500' : ''}`}
            placeholder="000.000.000-00"
            maxLength={14}
          />
          {cpfError && (
            <p className="text-[10px] text-red-500 mt-1">CPF inválido</p>
          )}
        </div>
        <div>
          <label className="label">Telefone / WhatsApp</label>
          <input
            value={data.phone}
            onChange={e => set('phone', maskPhone(e.target.value))}
            className="input-field"
            placeholder="(00) 00000-0000"
            maxLength={15}
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            id={`emerg-${label}`}
            checked={data.isEmergencyContact}
            onChange={e => set('isEmergencyContact', e.target.checked)}
            className="accent-teal-700 w-4 h-4"
          />
          <label htmlFor={`emerg-${label}`} className="text-sm text-gray-700 cursor-pointer">
            Telefone de emergência?
          </label>
        </div>
      </div>

      {/* Endereço */}
      {isG2 && showSameAddress && (
        <div className="flex items-center gap-3 pt-1">
          <input
            type="checkbox"
            id="same-addr"
            checked={g2.sameAddressAsGuardian1}
            onChange={e => onChange({ ...g2, sameAddressAsGuardian1: e.target.checked })}
            className="accent-teal-700 w-4 h-4"
          />
          <label htmlFor="same-addr" className="text-sm text-gray-700 cursor-pointer">
            Mesmo endereço do Responsável 1
          </label>
          {!g2.sameAddressAsGuardian1 && onCopyAddress && (
            <button
              type="button"
              onClick={onCopyAddress}
              className="ml-auto flex items-center gap-1 text-xs text-teal-700 border border-teal-300 rounded px-2 py-1 hover:bg-teal-50"
            >
              <Copy size={12} /> Copiar endereço do Responsável 1
            </button>
          )}
        </div>
      )}

      {!(isG2 && g2.sameAddressAsGuardian1) && (
        <AddressBlock
          address={data.address}
          onChange={addr => set('address', addr)}
          cepSuffix={label}
        />
      )}
    </div>
  );
};

// ─── speech hook ─────────────────────────────────────────────────────────────

function useSpeechRecognition(onTranscript: (text: string) => void) {
  const [isListening, setIsListening] = useState(false);
  const recRef = useRef<any>(null);

  const SpeechAPI =
    typeof window !== 'undefined'
      ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      : null;

  const isSupported = !!SpeechAPI;

  const toggle = () => {
    if (isListening) {
      recRef.current?.stop();
      setIsListening(false);
      return;
    }
    if (!SpeechAPI) return;
    const rec = new SpeechAPI();
    rec.lang = 'pt-BR';
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (e: any) => {
      const transcript = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join(' ')
        .trim();
      onTranscript(transcript);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    recRef.current = rec;
    rec.start();
    setIsListening(true);
  };

  return { isListening, isSupported, toggle };
}

// ─── main component ───────────────────────────────────────────────────────────

interface Props {
  value: SociofamilyData;
  onChange: (d: SociofamilyData) => void;
}

export const SociofamilySection: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);

  const setField = <K extends keyof SociofamilyData>(key: K, val: SociofamilyData[K]) =>
    onChange({ ...value, [key]: val });

  const copyAddressFromG1 = () => {
    onChange({
      ...value,
      guardian2: { ...value.guardian2, address: { ...value.guardian1.address }, sameAddressAsGuardian1: false },
    });
  };

  const marriedOrSame = value.familyStatus.guardiansMarriedOrSameAddress;

  const { isListening, isSupported, toggle } = useSpeechRecognition((text) => {
    const current = value.benefits.notes;
    setField('benefits', {
      ...value.benefits,
      notes: current ? `${current} ${text}` : text,
    });
  });

  return (
    <section>
      {/* Accordion header */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 border-b border-gray-200 mb-2 group"
      >
        <div className="flex items-center gap-2">
          <Users size={20} className="text-teal-700" />
          <span className="text-lg font-bold text-gray-800">Dados Sociofamiliares e Responsáveis</span>
          <span className="text-xs text-gray-400 font-normal ml-1">(opcional)</span>
        </div>
        {open ? <ChevronUp size={18} className="text-gray-500" /> : <ChevronDown size={18} className="text-gray-500" />}
      </button>

      {!open && (
        <p className="text-xs text-gray-400 mb-2">
          Clique para expandir e cadastrar responsáveis, benefícios sociais e contatos de emergência.
        </p>
      )}

      {open && (
        <div className="space-y-6 pt-2">
          {/* Notice LGPD */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-xs text-blue-800">
            Essas informações são <strong>opcionais</strong> e ajudam a escola a manter contato e compreender melhor o contexto do aluno.
            Os dados são protegidos pela LGPD e <strong>não aparecem em documentos públicos ou PDFs</strong> sem consentimento explícito.
          </div>

          {/* 1. Benefícios Sociais */}
          <div className="border border-gray-200 rounded-xl p-5 space-y-4 bg-gray-50">
            <h4 className="font-semibold text-gray-700 text-sm">Benefícios Sociais</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TriRadio
                label="Recebe algum benefício social?"
                value={value.benefits.receivesBenefit}
                onChange={v => setField('benefits', { ...value.benefits, receivesBenefit: v })}
              />
              <TriRadio
                label="Bolsa Família"
                value={value.benefits.bolsaFamilia}
                onChange={v => setField('benefits', { ...value.benefits, bolsaFamilia: v })}
              />
              <TriRadio
                label="BPC / LOAS"
                value={value.benefits.bpcLoas}
                onChange={v => setField('benefits', { ...value.benefits, bpcLoas: v })}
              />
              <div>
                <label className="label">Outro benefício</label>
                <input
                  value={value.benefits.otherBenefit}
                  onChange={e => setField('benefits', { ...value.benefits, otherBenefit: e.target.value })}
                  className="input-field"
                  placeholder="Descreva, se houver"
                />
              </div>
            </div>
            <div>
              <label className="label">Observações socioeconômicas</label>
              <div className="relative">
                <textarea
                  rows={2}
                  value={value.benefits.notes}
                  onChange={e => setField('benefits', { ...value.benefits, notes: e.target.value })}
                  className="input-field resize-none pr-10"
                  placeholder="Contexto socioeconômico relevante..."
                />
                {isSupported && (
                  <button
                    type="button"
                    onClick={toggle}
                    title={isListening ? 'Parar gravação' : 'Ditar observação'}
                    className={`absolute right-2 top-2 p-1 rounded-full transition-colors ${
                      isListening
                        ? 'text-red-500 animate-pulse bg-red-50'
                        : 'text-gray-400 hover:text-teal-700 hover:bg-teal-50'
                    }`}
                  >
                    {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                  </button>
                )}
              </div>
              {isListening && (
                <p className="text-[11px] text-red-500 mt-1 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  Ouvindo...
                </p>
              )}
            </div>
          </div>

          {/* 2. Responsável 1 */}
          <GuardianBlock
            label="Responsável 1"
            data={value.guardian1}
            onChange={g => setField('guardian1', g as SociofamilyGuardian)}
          />

          {/* 3. Responsável 2 */}
          <GuardianBlock
            label="Responsável 2"
            data={value.guardian2}
            onChange={g => setField('guardian2', g as SociofamilyGuardian2)}
            showSameAddress={marriedOrSame !== 'no'}
            onCopyAddress={copyAddressFromG1}
          />

          {/* 4. Estado familiar */}
          <div className="border border-gray-200 rounded-xl p-5 space-y-4 bg-gray-50">
            <h4 className="font-semibold text-gray-700 text-sm">Estado Familiar / Convivência</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <TriRadio
                label="Responsáveis são casados ou moram no mesmo endereço?"
                value={value.familyStatus.guardiansMarriedOrSameAddress}
                onChange={v => setField('familyStatus', { ...value.familyStatus, guardiansMarriedOrSameAddress: v })}
              />
              <div>
                <label className="label">Com quem o aluno mora atualmente?</label>
                <select
                  value={value.familyStatus.studentLivesWith}
                  onChange={e => setField('familyStatus', { ...value.familyStatus, studentLivesWith: e.target.value })}
                  className="input-field"
                >
                  {['', 'Mãe', 'Pai', 'Ambos', 'Avós', 'Responsável Legal', 'Outro'].map(o => (
                    <option key={o} value={o}>{o || 'Selecione'}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Nome do responsável principal pelo aluno</label>
                <input
                  value={value.familyStatus.mainGuardianName}
                  onChange={e => setField('familyStatus', { ...value.familyStatus, mainGuardianName: e.target.value })}
                  className="input-field"
                  placeholder="Nome completo"
                />
              </div>
              <div>
                <label className="label">Telefone principal para contato da escola</label>
                <input
                  value={value.familyStatus.schoolPrimaryPhone}
                  onChange={e => setField('familyStatus', { ...value.familyStatus, schoolPrimaryPhone: maskPhone(e.target.value) })}
                  className="input-field"
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>
              <div>
                <label className="label">Nome do contato de emergência</label>
                <input
                  value={value.familyStatus.emergencyContactName}
                  onChange={e => setField('familyStatus', { ...value.familyStatus, emergencyContactName: e.target.value })}
                  className="input-field"
                  placeholder="Nome"
                />
              </div>
              <div>
                <label className="label">Telefone de emergência principal</label>
                <input
                  value={value.familyStatus.emergencyContactPhone}
                  onChange={e => setField('familyStatus', { ...value.familyStatus, emergencyContactPhone: maskPhone(e.target.value) })}
                  className="input-field"
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                />
              </div>
            </div>
            <div>
              <label className="label">Observações familiares importantes</label>
              <textarea
                rows={2}
                value={value.familyStatus.notes}
                onChange={e => setField('familyStatus', { ...value.familyStatus, notes: e.target.value })}
                className="input-field resize-none"
                placeholder="Informações relevantes sobre a dinâmica familiar..."
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
