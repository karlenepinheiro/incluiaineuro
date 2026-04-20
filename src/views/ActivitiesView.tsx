// ActivitiesView.tsx
import React, { useState, useEffect } from 'react';
import { Upload, Zap, Save, Trash2, Search, Eye, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { AudioEnhancedTextarea } from '../components/AudioEnhancedTextarea';
import { Student, User, Activity, AtividadeJSON } from '../types';
import { GeneratedActivityService, TimelineService } from '../services/persistenceService';
import { DEMO_MODE } from '../services/supabase';
import { generateActivityDocument } from '../services/activityDocumentService';
import { FolhaSimples } from '../components/docs/FolhaSimples';

interface ActivitiesViewProps {
  students: Student[];
  user: User;
}

export const ActivitiesView: React.FC<ActivitiesViewProps> = ({ students, user }) => {
  const [activeTab, setActiveTab] = useState<'create' | 'library'>('create');
  const [topic, setTopic] = useState('');
  const [discipline, setDiscipline] = useState('');
  const [grade, setGrade] = useState('');
  const [period, setPeriod] = useState('');
  const [bnccQuery, setBnccQuery] = useState('');
  const [bnccCodes, setBnccCodes] = useState<string[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [atividade, setAtividade] = useState<AtividadeJSON | null>(null);
  const [generating, setGenerating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [library, setLibrary] = useState<Activity[]>([]);
  const [search, setSearch] = useState('');
  const [libraryPreview, setLibraryPreview] = useState<{ activity: Activity; atividade: AtividadeJSON | null } | null>(null);

  useEffect(() => {
    if (DEMO_MODE || !user?.id) return;
    GeneratedActivityService.getForTenant(user.id).then(rows => {
      const mapped: Activity[] = rows.map((r: any) => ({
        id:          r.id,
        title:       r.title,
        studentId:   r.student_id ?? '',
        content:     r.content ?? '',
        imageUrl:    r.image_url ?? undefined,
        guidance:    r.guidance ?? undefined,
        attachments: [],
        isAdapted:   r.is_adapted ?? false,
        createdAt:   r.created_at,
        tags:        r.tags ?? [],
      }));
      setLibrary(mapped);
    }).catch(console.error);
  }, [user?.id]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setUploadedImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    setFeedback(null);
    if (!selectedStudentId || !topic) return alert('Preencha o aluno e o tema.');
    setGenerating(true);
    setAtividade(null);
    try {
      const student = students.find(s => s.id === selectedStudentId);
      if (!student) throw new Error('Aluno não encontrado.');
      const result = await generateActivityDocument(topic, student, user, {
        discipline,
        grade,
        period,
        bnccCodes,
      });
      setAtividade(result);
      setFeedback({ type: 'success', msg: 'Atividade gerada com sucesso!' });
    } catch (e: any) {
      const msg: string = e?.message || '';
      const hint = msg.includes('CONFIG_') || msg.includes('configurado')
        ? 'O serviço de IA não está configurado no ambiente. Entre em contato com o suporte.'
        : msg.includes('fetch') || msg.includes('conexão')
        ? 'Falha de conexão. Verifique sua internet e tente novamente.'
        : msg || 'Erro ao gerar a atividade. Tente novamente.';
      setFeedback({ type: 'error', msg: hint });
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!atividade) return;
    const serialized = JSON.stringify(atividade);
    const tags = [
      ...(discipline ? [`DISC:${discipline}`] : []),
      ...(grade ? [`GRADE:${grade}`] : []),
      ...(period ? [`PERIOD:${period}`] : []),
      ...bnccCodes.map(c => `BNCC:${c}`),
    ];

    const newActivity: Activity = {
      id:          crypto.randomUUID(),
      title:       atividade.titulo,
      studentId:   selectedStudentId,
      content:     serialized,
      attachments: uploadedImage ? [uploadedImage] : [],
      isAdapted:   true,
      createdAt:   new Date().toISOString(),
      tags,
    };
    setLibrary([newActivity, ...library]);

    if (!DEMO_MODE && user?.tenant_id && user?.id) {
      try {
        const savedId = await GeneratedActivityService.save({
          tenantId:    user.tenant_id,
          userId:      user.id,
          studentId:   selectedStudentId || undefined,
          title:       newActivity.title,
          content:     serialized,
          bnccCodes,
          discipline:  discipline || undefined,
          tags,
          isAdapted:   true,
          creditsUsed: 1,
        });
        if (savedId) {
          setLibrary(prev => prev.map(a => a.id === newActivity.id ? { ...a, id: savedId } : a));
          if (selectedStudentId) {
            await TimelineService.add({
              tenantId:    user.tenant_id,
              studentId:   selectedStudentId,
              eventType:   'atividade',
              title:       `Atividade gerada: ${newActivity.title}`,
              description: `Disciplina: ${discipline || '—'}`,
              linkedId:    savedId,
              linkedTable: 'generated_activities',
              icon:        'Zap',
              author:      user.name,
            });
          }
        }
      } catch (e) {
        console.error('[ActivitiesView] erro ao salvar atividade no banco:', e);
      }
    }

    alert('Atividade salva na biblioteca!');
    setActiveTab('library');
  };

  const addBnccCode = (raw: string) => {
    const code = raw.trim().toUpperCase();
    if (!code || bnccCodes.includes(code)) return;
    setBnccCodes([...bnccCodes, code]);
    setBnccQuery('');
  };

  const removeBnccCode = (code: string) => setBnccCodes(bnccCodes.filter(c => c !== code));

  const parseLibraryAtividade = (act: Activity): AtividadeJSON | null => {
    try {
      const parsed = JSON.parse(act.content);
      if (parsed?.titulo && parsed?.questoes) return parsed as AtividadeJSON;
    } catch { /* content legado em Markdown */ }
    return null;
  };

  const selectedStudent = students.find(s => s.id === selectedStudentId);

  return (
    <div className="max-w-6xl mx-auto min-h-screen p-6">
      <div className="flex justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Atividades Adaptadas</h2>
          <p className="text-gray-500 text-sm">Crie, adapte e organize materiais pedagógicos.</p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg h-fit">
          <button onClick={() => setActiveTab('create')} className={`px-4 py-2 text-sm font-bold rounded-md ${activeTab === 'create' ? 'bg-white shadow' : 'text-gray-500'}`}>Criar</button>
          <button onClick={() => setActiveTab('library')} className={`px-4 py-2 text-sm font-bold rounded-md ${activeTab === 'library' ? 'bg-white shadow' : 'text-gray-500'}`}>Biblioteca</button>
        </div>
      </div>

      {activeTab === 'create' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Painel esquerdo — formulário */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 space-y-4">
            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Aluno</label>
              <select className="w-full border p-2 rounded" value={selectedStudentId} onChange={e => setSelectedStudentId(e.target.value)}>
                <option value="">Selecione Aluno...</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">Tema da Atividade</label>
              <AudioEnhancedTextarea
                fieldId="motivo"
                value={topic}
                onChange={setTopic}
                placeholder="Ex: Soma de frutas para autistas..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Disciplina</label>
                <input className="w-full border p-2 rounded" placeholder="Ex: Matemática" value={discipline} onChange={e => setDiscipline(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Ano/Série</label>
                <input className="w-full border p-2 rounded" placeholder="Ex: 3º ano" value={grade} onChange={e => setGrade(e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Período/Unidade</label>
                <input className="w-full border p-2 rounded" placeholder="Ex: 1º bimestre" value={period} onChange={e => setPeriod(e.target.value)} />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-gray-500 uppercase">BNCC</label>
              <div className="flex gap-2">
                <input
                  className="flex-1 border p-2 rounded"
                  placeholder="Digite código BNCC e pressione Enter"
                  value={bnccQuery}
                  onChange={e => setBnccQuery(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addBnccCode(bnccQuery); } }}
                />
                <button type="button" onClick={() => addBnccCode(bnccQuery)} className="px-3 rounded bg-purple-600 text-white text-sm font-bold hover:bg-purple-700">Add</button>
              </div>
              {bnccCodes.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {bnccCodes.map(code => (
                    <span key={code} className="inline-flex items-center gap-2 px-2 py-1 rounded-full bg-purple-50 text-purple-800 border border-purple-100 text-xs font-bold">
                      {code}
                      <button type="button" onClick={() => removeBnccCode(code)} className="text-purple-500 hover:text-purple-800">×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 pt-4">
              <label className="text-xs font-bold text-gray-500 uppercase mb-2 block">Enviar imagem de referência (opcional)</label>
              {!uploadedImage ? (
                <label className="border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50">
                  <Upload className="text-gray-400 mb-2" />
                  <span className="text-sm font-bold text-gray-600">Clique para enviar</span>
                  <span className="text-xs text-gray-400">PNG, JPG</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </label>
              ) : (
                <div className="relative">
                  <img src={uploadedImage} className="w-full h-48 object-cover rounded-lg border" />
                  <button onClick={() => setUploadedImage(null)} className="absolute top-2 right-2 bg-white/90 p-1 rounded-full shadow hover:bg-red-50">
                    <Trash2 className="text-red-500" size={16} />
                  </button>
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={handleGenerate} disabled={generating} className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-50">
                {generating ? <RefreshCw className="animate-spin" size={16} /> : <Zap size={16} />}
                Gerar Atividade
              </button>
            </div>

            <div className="flex gap-2 text-xs" style={{ color: '#92650a' }}>
              <span className="flex items-center gap-1 bg-yellow-50 border border-yellow-200 rounded-full px-2 py-0.5">
                🪙 Texto estruturado: <strong>1 crédito</strong>
              </span>
            </div>

            {feedback && (
              <div className={`p-3 rounded-lg text-sm font-bold flex items-center gap-2 ${feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                {feedback.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
                {feedback.msg}
              </div>
            )}

            <div className="pt-2">
              <button onClick={handleSave} disabled={!atividade} className="w-full bg-gray-900 hover:bg-black text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2 disabled:opacity-40">
                <Save size={16} /> Salvar na Biblioteca
              </button>
            </div>
          </div>

          {/* Painel direito — pré-visualização A4 */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 overflow-auto">
            <h3 className="font-bold text-gray-800 mb-3 flex items-center gap-2"><Eye size={16} /> Pré-visualização A4</h3>
            {!atividade ? (
              <div className="text-gray-400 text-sm border border-dashed rounded-lg p-8 text-center">
                Gere uma atividade para visualizar aqui.
              </div>
            ) : (
              <div style={{ transform: 'scale(0.55)', transformOrigin: 'top left', width: '181%' }}>
                <FolhaSimples
                  atividade={atividade}
                  studentName={selectedStudent?.name}
                  teacherName={user.name}
                  schoolName={(user as any).schoolName || (user as any).school_name || undefined}
                  grade={grade}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'library' && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          {libraryPreview ? (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">{libraryPreview.activity.title}</h3>
                <div className="flex gap-2">
                  <button onClick={() => setLibraryPreview(null)} className="px-3 py-2 text-sm font-bold rounded-lg border">← Voltar</button>
                </div>
              </div>
              {libraryPreview.atividade ? (
                <FolhaSimples
                  atividade={libraryPreview.atividade}
                  studentName={students.find(s => s.id === libraryPreview.activity.studentId)?.name}
                  teacherName={user.name}
                />
              ) : (
                <pre className="whitespace-pre-wrap text-sm text-gray-800 bg-gray-50 p-4 rounded-lg">{libraryPreview.activity.content}</pre>
              )}
            </div>
          ) : (
            <>
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800">Biblioteca</h3>
                <div className="flex items-center gap-2 border rounded-lg px-3 py-2">
                  <Search size={16} className="text-gray-400" />
                  <input className="outline-none text-sm" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)} />
                </div>
              </div>

              <div className="space-y-3">
                {library.filter(a => (a.title || '').toLowerCase().includes(search.toLowerCase())).map(act => (
                  <div key={act.id} className="border rounded-lg p-4 flex justify-between items-start gap-4">
                    <div className="flex-1">
                      <div className="font-bold text-gray-900">{act.title}</div>
                      <div className="text-xs text-gray-500 mt-1">{new Date(act.createdAt).toLocaleString()}</div>
                      {!!act.tags?.length && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {act.tags.map((t, idx) => (
                            <span key={`${act.id}-t-${idx}`} className="text-[11px] font-bold px-2 py-1 rounded-full bg-gray-100 text-gray-700">{t}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setLibraryPreview({ activity: act, atividade: parseLibraryAtividade(act) })}
                        className="p-2 rounded bg-gray-100 hover:bg-gray-200 text-gray-800"
                        title="Visualizar"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm('Excluir atividade?')) return;
                          setLibrary(library.filter(x => x.id !== act.id));
                          if (!DEMO_MODE) await GeneratedActivityService.delete(act.id).catch(console.error);
                        }}
                        className="p-2 rounded bg-red-50 hover:bg-red-100 text-red-700"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {library.length === 0 && (
                  <div className="text-gray-500 text-sm border border-dashed rounded-lg p-6">
                    Nenhuma atividade salva ainda.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};
