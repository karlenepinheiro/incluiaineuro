import React, { useState, useEffect } from 'react';
import { Student, SchoolConfig, PlanTier, getPlanLimits, PriorKnowledgeProfile } from '../types';
import { Save, ArrowLeft, Upload, FileText, Trash2, Plus, AlertCircle, Lock, Stethoscope, BookOpen, Users, HelpCircle, X, Paperclip, Sparkles } from 'lucide-react';
import { MultiSelect } from './MultiSelect';
import { SmartTextarea } from './SmartTextarea'; 
import { PedagogicalProfileSection, PedagogicalProfileSuggestionKey } from './PedagogicalProfileSection';
import { AIService, friendlyAIError } from '../services/aiService';
import { StorageService } from '../services/storageService';

const DIAGNOSIS_LIBRARY = [
    "TEA (Transtorno do Espectro Autista)", "TDAH (Transtorno de Déficit de Atenção e Hiperatividade)", 
    "Dislexia", "Discalculia", "TOD (Transtorno Opositivo Desafiador)", 
    "Transtorno de Ansiedade", "Deficiência Intelectual", "Paralisia Cerebral", 
    "Síndrome de Down", "Transtorno de Linguagem", "Altas Habilidades / Superdotação", 
    "Epilepsia", "Surdez / Deficiência Auditiva", "Baixa Visão / Deficiência Visual", 
    "Transtorno do Processamento Sensorial", "Síndrome de Asperger (TEA Nível 1)", 
    "Atraso Global do Desenvolvimento"
];

const SKILLS_LIBRARY = [
    "Boa memória visual", "Comunicação funcional", "Interesse por leitura", 
    "Coordenação motora preservada", "Autonomia parcial", "Interação social adequada", 
    "Raciocínio lógico", "Criatividade", "Atenção sustentada (em hiperfoco)", 
    "Organização de materiais", "Boa compreensão verbal", "Participação ativa em sala", 
    "Interesse em tecnologia", "Resolução de problemas simples", "Persistência em tarefas", 
    "Gosto por música/artes", "Reconhecimento de letras/números", "Vocabulário expressivo"
];

const DIFFICULTIES_LIBRARY = [
    "Déficit de atenção", "Impulsividade", "Dificuldade de leitura/decodificação", 
    "Dificuldade matemática", "Baixa tolerância à frustração", "Dificuldade social/interação", 
    "Rigidez comportamental", "Ansiedade em situações novas", "Dificuldade motora fina", 
    "Atraso na linguagem", "Problemas de memória de curto prazo", "Dificuldade de organização", 
    "Resistência a mudanças de rotina", "Dificuldade de interpretação textual", 
    "Dificuldade de concentração prolongada", "Sensibilidade sensorial (ruídos/luz)", 
    "Dificuldade em seguir regras coletivas"
];

const PROFESSIONALS_LIBRARY = [
    "Psicopedagogo", "Psicólogo", "Fonoaudiólogo", "Neuropediatra", 
    "Terapeuta Ocupacional", "Professor de AEE", "Coordenador Pedagógico", 
    "Diretor Escolar", "Médico Psiquiatra", "Assistente Social", 
    "Professor Regente", "Psicólogo Escolar", "Mediador Escolar", 
    "Neuropsicólogo", "Orientador Educacional", "Nutricionista", "Fisioterapeuta"
];

const PEDAGOGICAL_AI_LABELS: Record<PedagogicalProfileSuggestionKey, string> = {
  leitura: 'Leitura',
  escrita: 'Escrita',
  entendimento: 'Compreensão e entendimento',
  autonomia: 'Autonomia',
  atencao: 'Atenção',
  raciocinio: 'Raciocínio lógico-matemático',
  observacoes_pedagogicas: 'Observações pedagógicas gerais',
};

interface Props {
  initialData?: Student | null;
  onSave: (student: Student) => void;
  onCancel: () => void;
  regentName: string;
  availableSchools: SchoolConfig[];
  userPlan: PlanTier; 
}

export const StudentForm: React.FC<Props> = ({ initialData, onSave, onCancel, regentName, availableSchools = [], userPlan }) => {
  const defaultSchoolId = availableSchools && availableSchools.length > 0 ? availableSchools[0].id : '';

  // Texto livre da escola — inicializa do dado existente ou do primeiro da lista
  const resolveInitialSchoolName = () => {
    if (initialData?.schoolName) return initialData.schoolName;
    if (initialData?.schoolId) {
      const found = availableSchools.find(s => s.id === initialData.schoolId);
      if (found) return found.schoolName;
    }
    return availableSchools[0]?.schoolName ?? '';
  };
  const [schoolNameInput, setSchoolNameInput] = useState(resolveInitialSchoolName);

  const generateUniqueCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    code += '-';
    for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return `INC-${code}`;
  };

  const [formData, setFormData] = useState<Student>({
    id: initialData?.id || crypto.randomUUID(),
    unique_code: initialData?.unique_code || generateUniqueCode(),
    name: initialData?.name || '',
    birthDate: initialData?.birthDate || '',
    gender: initialData?.gender || '',
    guardianName: initialData?.guardianName || '',
    guardianPhone: initialData?.guardianPhone || '',
    guardianEmail: initialData?.guardianEmail || '',
    schoolId: initialData?.schoolId || defaultSchoolId,
    isExternalStudent: initialData?.isExternalStudent || false,
    externalSchoolName: initialData?.externalSchoolName || '',
    externalSchoolCity: initialData?.externalSchoolCity || '',
    externalProfessional: initialData?.externalProfessional || '',
    externalReferralSource: initialData?.externalReferralSource || '',
    grade: initialData?.grade || '',
    shift: initialData?.shift || '',
    regentTeacher: initialData?.regentTeacher || regentName,
    aeeTeacher: initialData?.aeeTeacher || '',
    coordinator: initialData?.coordinator || '',
    diagnosis: initialData?.diagnosis || [],
    cid: initialData?.cid || [], 
    supportLevel: initialData?.supportLevel || 'Nível 1',
    tipo_aluno: initialData?.tipo_aluno || 'com_laudo',
    medication: initialData?.medication || '',
    professionals: initialData?.professionals || [],
    abilities: initialData?.abilities || [], 
    difficulties: initialData?.difficulties || [], 
    strategies: initialData?.strategies || [],
    communication: initialData?.communication || [],
    observations: initialData?.observations || '',
    schoolHistory: initialData?.schoolHistory || '',
    familyContext: initialData?.familyContext || '',
    history: initialData?.history || '',
    photoUrl: initialData?.photoUrl || '',
    registrationDate: initialData?.registrationDate || new Date().toISOString(),
    documents: initialData?.documents || [],
    zipcode: initialData?.zipcode || '',
    street: initialData?.street || '',
    streetNumber: initialData?.streetNumber || '',
    complement: initialData?.complement || '',
    neighborhood: initialData?.neighborhood || '',
    city: initialData?.city || '',
    state: initialData?.state || '',
    priorKnowledge: initialData?.priorKnowledge ?? undefined,
  });

  const [cidInput, setCidInput] = useState('');
  const [cidList, setCidList] = useState<string[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [docUploadType, setDocUploadType] = useState<'Laudo' | 'Relatorio' | 'Outro'>('Laudo');

  const [generatingAI, setGeneratingAI] = useState<Partial<Record<PedagogicalProfileSuggestionKey, boolean>>>({});

  const handleSuggestAI = async (areaKey: PedagogicalProfileSuggestionKey) => {
    setGeneratingAI(prev => ({ ...prev, [areaKey]: true }));
    try {
      const notesKey: keyof PriorKnowledgeProfile =
        areaKey === 'observacoes_pedagogicas' ? areaKey : `${areaKey}_notes`;
      const currentScore =
        areaKey === 'observacoes_pedagogicas'
          ? undefined
          : formData.priorKnowledge?.[`${areaKey}_score` as keyof PriorKnowledgeProfile];
      const currentVal = formData.priorKnowledge?.[notesKey];
      const prompt = [
        'Você é um assistente pedagógico do IncluiAI.',
        `Gere somente 2 ou 3 bullet points curtos, em português do Brasil, para o campo "${PEDAGOGICAL_AI_LABELS[areaKey]}".`,
        'Use observações pedagógicas objetivas, éticas e verificáveis.',
        'Não invente diagnóstico, não cite deficiência sem base explícita e não escreva título.',
        `Aluno: ${formData.name || 'Não informado'}.`,
        `Série/ano: ${formData.grade || 'Não informado'}.`,
        `Histórico escolar: ${formData.schoolHistory || 'Não informado'}.`,
        `Contexto familiar: ${formData.familyContext || 'Não informado'}.`,
        `Observações gerais: ${formData.observations || 'Não informado'}.`,
        `Texto já preenchido no campo: ${String(currentVal || 'Não informado')}.`,
        currentScore ? `Score atual (1 a 5): ${currentScore}.` : '',
        'Retorne apenas os bullets finais, um por linha, começando com "- ".',
      ].filter(Boolean).join('\n');
      const suggestion = (await AIService.generateTextFromPrompt(prompt, null as unknown as never)).trim();

      if (!suggestion) {
        throw new Error('A IA não retornou sugestão para este campo.');
      }

      setFormData(prev => ({
        ...prev,
        priorKnowledge: {
          ...(prev.priorKnowledge || {}),
          [notesKey]: prev.priorKnowledge?.[notesKey]
            ? `${String(prev.priorKnowledge[notesKey]).trim()}\n${suggestion}`
            : suggestion,
        },
      }));
    } catch (error) {
      alert(friendlyAIError(error));
    } finally {
      setGeneratingAI(prev => ({ ...prev, [areaKey]: false }));
    }
  };

  const canUpload = getPlanLimits(userPlan)?.uploads ?? false;

  // Get current school config to list professionals
  const currentSchool = availableSchools.find(s => s.id === formData.schoolId);
  const schoolTeam = currentSchool?.team || [];

  const regents = schoolTeam.filter(m => m.role === 'Professor Regente');
  const aees = schoolTeam.filter(m => m.role === 'AEE');
  const coords = schoolTeam.filter(m => ['Coordenador', 'Pedagogo', 'Gestor'].includes(m.role));

  // Auto-preencher campos de equipe ao selecionar a escola.
  useEffect(() => {
    if (!currentSchool) return;

    const firstRegent = regents[0]?.name || '';
    const firstAee = aees[0]?.name || '';
    const firstCoord = coords[0]?.name || '';

    setFormData(prev => ({
      ...prev,
      regentTeacher: prev.regentTeacher || firstRegent || regentName || '',
      aeeTeacher: prev.aeeTeacher || firstAee,
      coordinator: prev.coordinator || firstCoord,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.schoolId]);

  useEffect(() => {
    if (initialData) {
      let normalizedCid: string[] = [];
      if (Array.isArray(initialData.cid)) {
          normalizedCid = initialData.cid;
      } else if (typeof initialData.cid === 'string' && initialData.cid.trim() !== '') {
          normalizedCid = [initialData.cid];
      }
      setCidList(normalizedCid);

      setFormData(prev => ({
        ...prev,
        ...initialData,
        diagnosis: initialData.diagnosis || [],
        professionals: initialData.professionals || [],
        abilities: initialData.abilities || [],
        difficulties: initialData.difficulties || [],
        strategies: initialData.strategies || [],
        communication: initialData.communication || [],
        documents: initialData.documents || [],
        cid: normalizedCid,
        priorKnowledge: initialData.priorKnowledge ?? undefined,
      }));
    }
  }, [initialData]);

  useEffect(() => {
      setFormData(prev => ({ ...prev, cid: cidList }));
  }, [cidList]);

  const [cepLoading, setCepLoading] = useState(false);
  const [cepError, setCepError] = useState('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (name === 'zipcode') setCepError('');
  };

  const handleCepBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length !== 8) return;
    setCepLoading(true);
    setCepError('');
    try {
      const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
      if (!res.ok) throw new Error('Serviço indisponível');
      const data = await res.json();
      if (data.erro) {
        setCepError('CEP não encontrado. Verifique e preencha o endereço manualmente.');
        return;
      }
      setFormData(prev => ({
        ...prev,
        street:       data.logradouro || prev.street,
        neighborhood: data.bairro     || prev.neighborhood,
        city:         data.localidade || prev.city,
        state:        data.uf         || prev.state,
      }));
    } catch {
      setCepError('Não foi possível buscar o CEP. Preencha o endereço manualmente.');
    } finally {
      setCepLoading(false);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      const original = reader.result as string;
      // Compress to max 200px wide / 80% quality to keep base64 small enough for DB
      const img = new Image();
      img.onload = () => {
        const MAX = 200;
        const scale = img.width > MAX ? MAX / img.width : 1;
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(img.width  * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) { setFormData(prev => ({ ...prev, photoUrl: original })); return; }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        const compressed = canvas.toDataURL('image/jpeg', 0.8);
        setFormData(prev => ({ ...prev, photoUrl: compressed }));
      };
      img.onerror = () => setFormData(prev => ({ ...prev, photoUrl: original }));
      img.src = original;
    };
    reader.readAsDataURL(file);
  };

  const handleAddCid = () => {
      if (cidInput.trim() && !cidList.includes(cidInput.trim().toUpperCase())) {
          setCidList([...cidList, cidInput.trim().toUpperCase()]);
          setCidInput('');
      }
  };

  const handleRemoveCid = (cidToRemove: string) => {
      setCidList(cidList.filter(c => c !== cidToRemove));
  };

  const handleLaudoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!canUpload) {
          alert("Recurso disponível a partir do plano Pro. Faça upgrade para desbloquear.");
          e.target.value = ''; 
          return;
      }
      const file = e.target.files?.[0];
      if (!file) return;

      setIsUploading(true);
      try {
          const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
          const path = `${formData.id}/${Date.now()}_${cleanName}`;
          
          const uploadedPath = await StorageService.uploadFile(file, 'laudos', path);

          if (uploadedPath) {
              const publicUrl = await StorageService.getPublicUrl('laudos', uploadedPath);
              const newDoc = {
                  name: file.name,
                  date: new Date().toLocaleDateString(),
                  type: docUploadType as any,
                  url: publicUrl ?? undefined,
                  path: uploadedPath
              };
              setFormData(prev => ({
                  ...prev,
                  documents: [...(prev.documents || []), newDoc]
              }));
              alert("Documento anexado! A IA pode usar este arquivo para analisar o caso.");
          } else {
              throw new Error("Falha ao processar arquivo.");
          }
      } catch (error) {
          console.error(error);
          alert("Erro no upload. Tente novamente.");
      } finally {
          setIsUploading(false);
          e.target.value = ''; 
      }
  };

  const handleRemoveDoc = (index: number) => {
      if (confirm("Remover este anexo? A exclusão é permanente.")) {
          const newDocs = [...(formData.documents || [])];
          newDocs.splice(index, 1);
          setFormData(prev => ({ ...prev, documents: newDocs }));
      }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) {
        alert("Preencha o campo obrigatório: Nome do aluno.");
        return;
    }
    // Usa o texto livre digitado. Se bater com uma escola cadastrada, mantém o schoolId.
    // school_name (text) é a coluna real do DB — schoolId (UUID) não existe como FK.
    const matchedSchool = availableSchools.find(
      s => s.schoolName.trim().toLowerCase() === schoolNameInput.trim().toLowerCase()
    );
    const resolvedSchoolName = formData.isExternalStudent
      ? (formData.externalSchoolName || '')
      : (schoolNameInput.trim() || matchedSchool?.schoolName || '');
    const resolvedSchoolId = matchedSchool?.id || formData.schoolId || '';
    onSave({ ...formData, schoolId: resolvedSchoolId, schoolName: resolvedSchoolName });
  };

  const Tooltip = ({text}: {text: string}) => (
      <div className="group relative inline-block ml-1">
          <HelpCircle size={12} className="text-gray-400 cursor-help"/>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block w-48 bg-gray-800 text-white text-xs rounded p-2 z-10">
              {text}
          </div>
      </div>
  );

  const isModoTriagem = formData.tipo_aluno === 'em_triagem';

  return (
    <div className="max-w-5xl mx-auto pb-20">
      
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
            <button onClick={onCancel} className="text-gray-500 hover:text-gray-700"><ArrowLeft size={24} /></button>
            <div>
                <h2 className="text-2xl font-bold text-gray-800">{initialData ? 'Editar Aluno' : 'Novo Cadastro'}</h2>
                <p className="text-sm text-gray-500">Preencha os dados completos para gerar documentos automáticos.</p>
            </div>
        </div>
      </div>

      {/* Banner de modo — com toggle */}
      <div className={`mb-4 p-4 rounded-xl border flex items-center gap-3 ${isModoTriagem ? 'bg-yellow-50 border-yellow-200' : 'bg-blue-50 border-blue-200'}`}>
        <span className="text-2xl">{isModoTriagem ? '🔍' : '📋'}</span>
        <div className="flex-1">
          <p className={`font-bold text-sm ${isModoTriagem ? 'text-yellow-800' : 'text-blue-800'}`}>
            {isModoTriagem ? 'Modo: Aluno em Triagem/Observação' : 'Modo: Aluno com Laudo (diagnóstico confirmado)'}
          </p>
          <p className={`text-xs mt-0.5 ${isModoTriagem ? 'text-yellow-700' : 'text-blue-700'}`}>
            {isModoTriagem
              ? 'Dados clínicos (CID, diagnóstico, medicação) estão ocultos. Podem ser adicionados futuramente após laudo.'
              : 'Formulário completo com dados clínicos, diagnóstico e medicação.'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="text-xs font-semibold text-gray-500 mb-1">Tipo de cadastro</p>
          <div className="flex rounded-lg overflow-hidden border border-gray-300 text-xs font-bold shadow-sm">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, tipo_aluno: 'em_triagem' }))}
              className={`px-3 py-1.5 transition-colors ${isModoTriagem ? 'bg-yellow-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              🔍 Em Triagem
            </button>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, tipo_aluno: 'com_laudo' }))}
              className={`px-3 py-1.5 transition-colors ${!isModoTriagem ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              📋 Com Laudo
            </button>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 space-y-8">
        
        {/* Identificação */}
        <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="flex flex-col items-center space-y-3">
                <div className="w-32 h-32 bg-gray-100 rounded-full border-4 border-white shadow-md overflow-hidden flex items-center justify-center relative group">
                     {formData.photoUrl ? <img src={formData.photoUrl} className="w-full h-full object-cover" /> : <span className="text-gray-400 text-xs">Foto</span>}
                     <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition cursor-pointer">
                        <Upload className="text-white" size={24} />
                        <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" accept="image/*" onChange={handlePhotoUpload} />
                     </div>
                </div>
            </div>
            <div className="flex-1 w-full grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="md:col-span-2">
                    <label className="label">Nome Completo *</label>
                    <input required name="name" value={formData.name} onChange={handleChange} className="input-field" placeholder="Nome do aluno" />
                    <p className="text-[10px] text-gray-400 mt-1">Clique aqui e insira o nome conforme certidão.</p>
                </div>
                <div><label className="label">Data de Nascimento *</label><input required type="date" name="birthDate" value={formData.birthDate} onChange={handleChange} className="input-field" /></div>
                <div><label className="label">Gênero</label><select name="gender" value={formData.gender} onChange={handleChange} className="input-field"><option value="">Selecione</option><option value="M">Masculino</option><option value="F">Feminino</option><option value="OTHER">Outro</option></select></div>
                <div><label className="label">Responsável Legal</label><input name="guardianName" value={formData.guardianName} onChange={handleChange} className="input-field" /></div>
                <div><label className="label">Telefone/WhatsApp</label><input name="guardianPhone" value={formData.guardianPhone} onChange={handleChange} className="input-field" /></div>
                {formData.unique_code && (
                  <div className="md:col-span-2">
                    <label className="label">Código Único do Aluno</label>
                    <div className="flex items-center gap-2">
                      <input readOnly value={formData.unique_code} className="input-field font-mono text-xs bg-gray-50 text-petrol font-bold tracking-widest cursor-default" />
                      <button type="button" onClick={() => navigator.clipboard.writeText(formData.unique_code!)} className="text-xs text-gray-400 hover:text-petrol border rounded px-2 py-1 whitespace-nowrap">Copiar</button>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Este código é único e imutável. A busca de alunos entre escolas ainda não está disponível, mas será liberada em breve em uma próxima atualização.</p>
                  </div>
                )}
            </div>
        </div>

        {/* Endereço */}
        <section>
          <h3 className="section-title">📍 Endereço Residencial</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">CEP</label>
              <div className="relative">
                <input name="zipcode" value={formData.zipcode || ''} onChange={handleChange} onBlur={handleCepBlur} className="input-field pr-8" placeholder="00000-000" maxLength={9} />
                {cepLoading && (
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-petrol animate-spin">⟳</span>
                )}
              </div>
              {cepError && <p className="text-[10px] text-red-500 mt-1">{cepError}</p>}
            </div>
            <div className="md:col-span-2">
              <label className="label">Logradouro</label>
              <input name="street" value={formData.street || ''} onChange={handleChange} className="input-field" placeholder="Rua, Avenida, Travessa..." />
            </div>
            <div>
              <label className="label">Número</label>
              <input name="streetNumber" value={formData.streetNumber || ''} onChange={handleChange} className="input-field" placeholder="Nº" />
            </div>
            <div>
              <label className="label">Complemento</label>
              <input name="complement" value={formData.complement || ''} onChange={handleChange} className="input-field" placeholder="Apto, Bloco, Casa..." />
            </div>
            <div>
              <label className="label">Bairro</label>
              <input name="neighborhood" value={formData.neighborhood || ''} onChange={handleChange} className="input-field" placeholder="Bairro" />
            </div>
            <div>
              <label className="label">Cidade</label>
              <input name="city" value={formData.city || ''} onChange={handleChange} className="input-field" placeholder="Cidade" />
            </div>
            <div>
              <label className="label">Estado (UF)</label>
              <select name="state" value={formData.state || ''} onChange={handleChange} className="input-field">
                <option value="">Selecione</option>
                {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map(uf => (
                  <option key={uf} value={uf}>{uf}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* Dados Escolares & Vínculos */}
        <section>
          <h3 className="section-title">
            <BookOpen size={20} className="text-brand-600"/>
            Dados Escolares & Equipe
            {formData.isExternalStudent && (
              <span style={{
                marginLeft: 'auto',
                background: '#D97706',
                color: 'white',
                fontSize: '0.6rem',
                fontWeight: 800,
                padding: '2px 10px',
                borderRadius: 999,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}>
                Aluno Externo
              </span>
            )}
          </h3>

          {/* Toggle externo */}
          <div className={`mb-5 flex items-center justify-between rounded-xl px-4 py-3 border ${formData.isExternalStudent ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-200'}`}>
            <div>
              <p className={`text-sm font-bold ${formData.isExternalStudent ? 'text-amber-900' : 'text-gray-700'}`}>
                Aluno externo (atendido fora da escola)
              </p>
              <p className={`text-xs mt-0.5 ${formData.isExternalStudent ? 'text-amber-700' : 'text-gray-500'}`}>
                Ative para registrar alunos de outras instituições ou em acompanhamento clínico externo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, isExternalStudent: !prev.isExternalStudent }))}
              className={`relative w-12 h-6 rounded-full transition-colors flex-shrink-0 ${formData.isExternalStudent ? 'bg-amber-500' : 'bg-gray-200'}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${formData.isExternalStudent ? 'translate-x-6' : ''}`} />
            </button>
          </div>

          {/* Bloco de origem — visível somente quando externo */}
          {formData.isExternalStudent && (
            <div style={{ border: '2px solid #F59E0B', borderRadius: 12, padding: '1rem 1.25rem', marginBottom: '1.25rem', background: '#FFFBEB' }}>
              {/* Texto orientador */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#FEF3C7', borderRadius: 8, padding: '10px 14px', marginBottom: '1rem' }}>
                <AlertCircle size={15} style={{ color: '#92400E', flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13, color: '#78350F', margin: 0, lineHeight: 1.55 }}>
                  Este aluno pertence a outra instituição. Os dados abaixo referem-se à escola de
                  origem. O atendimento será registrado na <strong>sua escola</strong>.
                </p>
              </div>

              <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#92400E', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                Origem do Aluno
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Escola / Instituição de origem</label>
                  <input
                    value={formData.externalSchoolName || ''}
                    onChange={e => setFormData(prev => ({ ...prev, externalSchoolName: e.target.value }))}
                    className="input-field"
                    placeholder="Ex: Escola Estadual Jardim das Flores"
                  />
                </div>
                <div>
                  <label className="label">Cidade de origem</label>
                  <input
                    value={formData.externalSchoolCity || ''}
                    onChange={e => setFormData(prev => ({ ...prev, externalSchoolCity: e.target.value }))}
                    className="input-field"
                    placeholder="Ex: Palmas - TO"
                  />
                </div>
                <div>
                  <label className="label">Profissional responsável pelo encaminhamento</label>
                  <input
                    value={formData.externalProfessional || ''}
                    onChange={e => setFormData(prev => ({ ...prev, externalProfessional: e.target.value }))}
                    className="input-field"
                    placeholder="Ex: Profa. Ana Silva"
                  />
                </div>
                <div>
                  <label className="label">Origem do encaminhamento</label>
                  <select
                    value={formData.externalReferralSource || ''}
                    onChange={e => setFormData(prev => ({ ...prev, externalReferralSource: e.target.value }))}
                    className="input-field"
                  >
                    <option value="">Selecione</option>
                    <option value="Escola">Escola</option>
                    <option value="Clínica">Clínica / Consultório</option>
                    <option value="UBS">UBS / CAPS</option>
                    <option value="Família">Família</option>
                    <option value="Prefeitura">Prefeitura / SEMED</option>
                    <option value="Outro">Outro</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Grid principal — escola de atendimento + equipe */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Escola de atendimento */}
            <div>
              <label className="label">
                {formData.isExternalStudent ? 'Escola de Atendimento' : 'Escola *'}
                {formData.isExternalStudent && (
                  <span style={{ fontSize: '0.68rem', color: '#9CA3AF', fontWeight: 400, marginLeft: 4 }}>
                    (preenchida pelo sistema)
                  </span>
                )}
              </label>
              {formData.isExternalStudent ? (
                <div style={{ position: 'relative' }}>
                  <input
                    readOnly
                    value={schoolNameInput || 'Escola não configurada'}
                    className="input-field"
                    style={{ background: '#F9FAFB', color: '#6B7280', cursor: 'not-allowed', paddingRight: '2rem' }}
                  />
                  <Lock size={13} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#D1D5DB' }} />
                </div>
              ) : (
                <>
                  <input
                    list="escola-suggestions"
                    value={schoolNameInput}
                    onChange={e => setSchoolNameInput(e.target.value)}
                    className="input-field"
                    placeholder="Digite ou selecione a escola…"
                    autoComplete="off"
                  />
                  <datalist id="escola-suggestions">
                    {availableSchools.map(s => (
                      <option key={s.id} value={s.schoolName} />
                    ))}
                  </datalist>
                  {schoolNameInput.trim() &&
                    !availableSchools.some(s => s.schoolName.trim().toLowerCase() === schoolNameInput.trim().toLowerCase()) && (
                    <p style={{ fontSize: '0.65rem', color: '#D97706', marginTop: 3 }}>
                      Escola nova — será registrada ao salvar. Complete os dados em Configurações depois.
                    </p>
                  )}
                </>
              )}
              {formData.isExternalStudent && (
                <p style={{ fontSize: '0.65rem', color: '#9CA3AF', marginTop: 3 }}>
                  O atendimento deste aluno é registrado nesta escola.
                </p>
              )}
            </div>

            {/* Série/Ano */}
            <div>
              <label className="label">
                Série / Ano
                {formData.isExternalStudent && (
                  <span style={{ fontSize: '0.68rem', color: '#9CA3AF', fontWeight: 400, marginLeft: 4 }}>(opcional)</span>
                )}
              </label>
              <input name="grade" value={formData.grade} onChange={handleChange} className="input-field" placeholder="Ex: 3º ano EF" />
            </div>

            {/* Turno */}
            <div>
              <label className="label">
                Turno
                {formData.isExternalStudent && (
                  <span style={{ fontSize: '0.68rem', color: '#9CA3AF', fontWeight: 400, marginLeft: 4 }}>(opcional)</span>
                )}
              </label>
              <select name="shift" value={formData.shift} onChange={handleChange} className="input-field">
                <option value="">Selecione</option>
                <option value="Matutino">Matutino</option>
                <option value="Vespertino">Vespertino</option>
                <option value="Integral">Integral</option>
              </select>
            </div>

            {/* Professor Regente */}
            <div>
              <label className="label">
                Professor Regente
                {formData.isExternalStudent && (
                  <span style={{ fontSize: '0.68rem', color: '#9CA3AF', fontWeight: 400, marginLeft: 4 }}>(opcional)</span>
                )}
              </label>
              <input
                list="regents"
                name="regentTeacher"
                value={formData.regentTeacher}
                onChange={handleChange}
                className="input-field"
                placeholder="Selecione ou digite..."
              />
              <datalist id="regents">
                {regents.map(r => <option key={r.id} value={r.name}/>)}
              </datalist>
            </div>

            {/* Prof. AEE */}
            <div>
              <label className="label">Prof. AEE / Especialista</label>
              <input
                list="aees"
                name="aeeTeacher"
                value={formData.aeeTeacher}
                onChange={handleChange}
                className="input-field"
                placeholder="Selecione ou digite..."
              />
              <datalist id="aees">
                {aees.map(r => <option key={r.id} value={r.name}/>)}
              </datalist>
            </div>

            {/* Coordenação */}
            <div>
              <label className="label">Coordenação / Gestão</label>
              <input
                list="coords"
                name="coordinator"
                value={formData.coordinator}
                onChange={handleChange}
                className="input-field"
                placeholder="Selecione ou digite..."
              />
              <datalist id="coords">
                {coords.map(r => <option key={r.id} value={r.name}/>)}
              </datalist>
            </div>

          </div>
        </section>

        {/* Dados Clínicos — oculto para triagem */}
        {!isModoTriagem && (
        <section>
          <h3 className="section-title"><Stethoscope size={20} className="text-brand-600"/> Dados Clínicos e de Saúde</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-3">
                <MultiSelect 
                    label="Diagnóstico(s)" 
                    options={DIAGNOSIS_LIBRARY} 
                    selected={formData.diagnosis} 
                    onChange={(v) => setFormData({...formData, diagnosis: v})} 
                    placeholder="Selecione ou digite..."
                />
            </div>
            
            <div>
                <label className="label">CID (Código) <Tooltip text="Código Internacional de Doenças. Ex: F84.0"/></label>
                <div className="flex gap-2 mb-2">
                    <input 
                        value={cidInput} 
                        onChange={e => setCidInput(e.target.value)} 
                        className="input-field uppercase" 
                        placeholder="Ex: F84.0" 
                        onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCid())}
                    />
                    <button type="button" onClick={handleAddCid} className="bg-brand-600 text-white px-3 rounded-md hover:bg-brand-700 transition">
                        <Plus size={18}/>
                    </button>
                </div>
                <div className="flex flex-wrap gap-1">
                    {cidList.map((cid, idx) => (
                        <span key={idx} className="bg-gray-200 text-gray-800 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                            {cid}
                            <button type="button" onClick={() => handleRemoveCid(cid)} className="hover:text-red-600"><X size={12}/></button>
                        </span>
                    ))}
                </div>
            </div>

            {/* Tipo de aluno removido do formulário: todo cadastro aqui é "Aluno com Laudo". */}
            <div><label className="label">Nível de Suporte</label><select name="supportLevel" value={formData.supportLevel} onChange={handleChange} className="input-field"><option>Nível 1</option><option>Nível 2</option><option>Nível 3</option></select></div>
            <div className="md:col-span-3"><label className="label">Medicação em uso</label><input name="medication" value={formData.medication} onChange={handleChange} className="input-field" placeholder="Nome, dosagem e horário (se houver na escola)" /></div>
            <div className="md:col-span-3">
                <MultiSelect 
                    label="Profissionais Externos" 
                    options={PROFESSIONALS_LIBRARY} 
                    selected={formData.professionals} 
                    onChange={(v) => setFormData({...formData, professionals: v})} 
                    placeholder="Selecione ou digite..."
                />
            </div>

            {/* Upload de Laudos */}
            <div className="md:col-span-3 bg-gray-50 p-4 rounded-lg border border-dashed border-gray-300">
                <label className="label flex items-center gap-2 mb-2">
                    <Paperclip size={16}/> Documentos, Laudos e Relatórios
                </label>
                <div className="flex items-center gap-4 mb-4">
                    <select
                      value={docUploadType}
                      onChange={(e) => setDocUploadType(e.target.value as any)}
                      className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-semibold shadow-sm"
                    >
                      <option value="Laudo">Laudo</option>
                      <option value="Relatorio">Relatório</option>
                      <option value="Outro">Outro</option>
                    </select>

                    <label className={`cursor-pointer bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 flex items-center gap-2 ${!canUpload ? 'opacity-50 cursor-not-allowed' : ''}`}>
                         <Upload size={16}/> {isUploading ? 'Enviando...' : 'Anexar Documento'}
                         <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" onChange={handleLaudoUpload} disabled={isUploading} />
                    </label>
                    {!canUpload && <span className="text-xs text-orange-600 font-bold bg-orange-50 px-2 py-1 rounded flex items-center gap-1"><Lock size={10}/> Recurso PRO/Master</span>}
                </div>
                
                <p className="text-xs text-gray-500 mb-3">
                    <Sparkles size={12} className="inline text-brand-500 mr-1"/>
                    A IA analisará estes documentos para gerar sugestões precisas nos relatórios e PEI.
                </p>

                <div className="space-y-2">
                    {formData.documents?.map((doc, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-white p-2 rounded border border-gray-200 text-sm">
                            <div className="flex items-center gap-2">
                                <FileText size={16} className="text-brand-500"/>
                                <span className="text-gray-700 font-medium">{doc.name}</span>
                                <span className="text-xs text-gray-400">({doc.date})</span>
                            </div>
                            <div className="flex gap-2">
                                <a href={doc.url} target="_blank" rel="noreferrer" className="text-brand-600 text-xs hover:underline flex items-center gap-1 font-bold">Ver</a>
                                <button type="button" onClick={() => handleRemoveDoc(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={14}/></button>
                            </div>
                        </div>
                    ))}
                    {(!formData.documents || formData.documents.length === 0) && <p className="text-xs text-gray-400 italic">Nenhum documento anexado.</p>}
                </div>
            </div>

          </div>
        </section>
        )} {/* fim !isModoTriagem */}

        {/* Histórico e Contexto */}
        <section>
          <h3 className="section-title"><Users size={20} className="text-brand-600"/> Contexto e Histórico</h3>
          <div className="space-y-6">
             {isModoTriagem && (
               <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-4">
                 <label className="label mb-2 text-yellow-800">Com quem vive / Composição familiar</label>
                 <SmartTextarea value={formData.familyContext} onChange={(v) => setFormData({...formData, familyContext: v})} placeholder="Ex: mora com mãe e avó; pai ausente; família extensa próxima..." context="social" />
               </div>
             )}
             <div>
                <label className="label mb-2">Histórico Escolar Prégresso</label>
                <SmartTextarea value={formData.schoolHistory} onChange={(v) => setFormData({...formData, schoolHistory: v})} placeholder="Relate brevemente a trajetória escolar anterior (repetências, trocas de escola...)" context="general" />
                <p className="text-[10px] text-gray-400 mt-1">Use o microfone para ditar o histórico.</p>
             </div>
             {!isModoTriagem && (
             <div>
                <label className="label mb-2">Contexto Familiar</label>
                <SmartTextarea value={formData.familyContext} onChange={(v) => setFormData({...formData, familyContext: v})} placeholder="Dinâmica familiar, quem cuida, apoio em casa..." context="social" />
             </div>
             )}
             <div>
                <label className="label mb-2">Observações Gerais {isModoTriagem ? '/ Observações Iniciais' : ''}</label>
                <SmartTextarea value={formData.observations} onChange={(v) => setFormData({...formData, observations: v})} placeholder={isModoTriagem ? "Descreva o que motivou a triagem, comportamentos observados, queixas..." : "Outras informações relevantes..."} context="general" />
             </div>
          </div>
        </section>

        {/* Habilidades e Dificuldades */}
        <section>
            <h3 className="section-title"><AlertCircle size={20} className="text-brand-600"/> Perfil Pedagógico</h3>
            <div className="space-y-4">
                <MultiSelect
                    label="Habilidades / Potencialidades"
                    options={SKILLS_LIBRARY}
                    selected={formData.abilities}
                    onChange={v => setFormData({...formData, abilities: v})}
                />
                <MultiSelect
                    label="Dificuldades / Barreiras"
                    options={DIFFICULTIES_LIBRARY}
                    selected={formData.difficulties}
                    onChange={v => setFormData({...formData, difficulties: v})}
                />
            </div>
        </section>

        {/* Conhecimento Prévio e Perfil Pedagógico Inicial */}
        <PedagogicalProfileSection
          data={formData.priorKnowledge}
          onChange={(pk) => setFormData(prev => ({ ...prev, priorKnowledge: pk }))}
          onSuggestAI={handleSuggestAI}
          generatingAreas={generatingAI}
        />

        <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
          <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
          <button type="submit" className="btn-primary">Salvar Aluno</button>
        </div>
      </form>
      <style>{`
        .label { display: block; font-size: 0.875rem; font-weight: 600; color: #374151; margin-bottom: 0.25rem; }
        .input-field { width: 100%; border-radius: 0.5rem; border: 1px solid #d1d5db; padding: 0.625rem; outline: none; transition: border-color 0.2s; }
        .input-field:focus { border-color: #0d9488; ring: 2px; ring-color: #0d9488; }
        .section-title { font-size: 1.125rem; font-weight: 700; color: #1f2937; border-bottom: 1px solid #f3f4f6; padding-bottom: 0.5rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 0.5rem; }
        .btn-primary { background-color: #0f766e; color: white; padding: 0.625rem 1.5rem; border-radius: 0.5rem; font-weight: 700; display: flex; align-items: center; gap: 0.5rem; transition: background-color 0.2s; }
        .btn-primary:hover { background-color: #115e59; }
        .btn-secondary { border: 1px solid #d1d5db; color: #374151; padding: 0.625rem 1.5rem; border-radius: 0.5rem; font-weight: 600; background-color: white; transition: background-color 0.2s; }
        .btn-secondary:hover { background-color: #f9fafb; }
      `}</style>
    </div>
  );
};
