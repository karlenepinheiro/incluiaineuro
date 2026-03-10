import React, { useState, useEffect, useRef } from 'react';
import { Student, Protocol, DocumentType, PlanTier, ServiceRecord, DocumentAnalysis, FichaComplementar, User as UserType } from '../types';
import {
  User, Calendar, FileText, Activity, Brain,
  ShieldCheck, Clock, Edit, ArrowLeft, Eye,
  BarChart, Printer, CheckCircle, FilePlus, AlertCircle, Plus, Stethoscope, Save, Sparkles, FileSearch,
  ClipboardCheck, Trash2, X, Download, Paperclip
} from 'lucide-react';
import { SmartTextarea } from './SmartTextarea';
import { AIService } from '../services/aiService';
import { ExportService } from '../services/exportService';
import { databaseService } from '../services/databaseService';
import { StorageService } from '../services/storageService';
import { StudentDocumentService, MedicalReportService, TimelineService } from '../services/persistenceService';
import { DEMO_MODE } from '../services/supabase';

interface StudentProfileProps {
  student: Student;
  protocols: Protocol[];
  onBack: () => void;
  onEdit: () => void;
  onViewProtocol: (protocol: Protocol) => void;
  onCreateDerived?: (sourceProtocol: Protocol, targetType: DocumentType) => void;
  userPlan?: PlanTier;
  user?: UserType;
  serviceRecords?: ServiceRecord[];
  onAddServiceRecord?: (record: ServiceRecord) => void;
  onUpdateStudent?: (s: Student) => void;
}

export const StudentProfile: React.FC<StudentProfileProps> = ({
  student,
  protocols,
  onBack,
  onEdit,
  onViewProtocol,
  onCreateDerived,
  userPlan = PlanTier.FREE,
  user,
  serviceRecords = [],
  onAddServiceRecord,
  onUpdateStudent,
}) => {
  const [analyzingDocId, setAnalyzingDocId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'docs' | 'fichas' | 'timeline'>('info');
  const [fichas, setFichas] = useState<FichaComplementar[]>(student.fichasComplementares || []);
  const [fichaEditId, setFichaEditId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [docUploadType, setDocUploadType] = useState<'Laudo' | 'Relatorio' | 'Outro'>('Laudo');
  const [isUploadingDoc, setIsUploadingDoc] = useState(false);
  const [docPreview, setDocPreview] = useState<{ name: string; url: string } | null>(null);

  // Use state to track analyses locally for immediate UI update, typically this would be synced to DB/App level
  const [analyses, setAnalyses] = useState<DocumentAnalysis[]>(student.documentAnalyses || []);
  
  // History State
  // Persist "Histórico e Evolução" using a stable DB-backed field.
  // Some Supabase schemas don't have a dedicated `history` column, but do have `schoolHistory`.
  const [historyText, setHistoryText] = useState((student.schoolHistory || student.history || '') as string);
  const [isSavingHistory, setIsSavingHistory] = useState(false);

  const studentProtocols = protocols.filter(p => p.studentId === student.id);
  
  const calculateAge = (dob: string) => {
    const diff = Date.now() - new Date(dob).getTime();
    const ageDate = new Date(diff); 
    return Math.abs(ageDate.getUTCFullYear() - 1970);
  };

  const handleDownloadFiche = () => {
      const school = user?.schoolConfigs?.[0] ?? null;
      ExportService.generateStudentProfilePDF(student, user?.name || 'Sistema', school);
  };

  const handleSaveHistory = async () => {
      setIsSavingHistory(true);
      try {
          const updatedStudent = { ...student, schoolHistory: historyText };
          await databaseService.saveStudent(updatedStudent);
          onUpdateStudent?.(updatedStudent);
          alert("Histórico salvo com sucesso!");
      } catch (e) {
          console.error(e);
          alert("Erro ao salvar histórico.");
      } finally {
          setIsSavingHistory(false);
      }
  };

  const handleAnalyzeDoc = async (doc: {name: string, url?: string, path?: string}, index: number) => {
      if (!confirm("Analisar este documento com IA? (Custo: 2 créditos)")) return;
      setAnalyzingDocId(index.toString());
      try {
          const effectiveUser: any = user ?? { id: 'local', tenant_id: student.tenant_id ?? 'default', plan: userPlan };
          const result = await AIService.analyzeDocument(doc.name, doc.url, student, effectiveUser);

          const updatedAnalyses = [result, ...analyses];
          setAnalyses(updatedAnalyses);

          // Persist analysis no students (legado)
          const updatedStudent = { ...student, documentAnalyses: updatedAnalyses };
          await databaseService.saveStudent(updatedStudent);

          // Salvar em medical_reports (tabela Sprint 2)
          if (!DEMO_MODE && (user as any)?.tenant_id) {
            const tenantId = (user as any).tenant_id;
            const reportId = await MedicalReportService.save({
              tenantId,
              studentId:         student.id,
              synthesis:         result.synthesis,
              pedagogicalPoints: result.pedagogicalPoints,
              suggestions:       result.suggestions,
              rawContent:        doc.name,
            });

            // Timeline: laudo analisado
            await TimelineService.add({
              tenantId,
              studentId:   student.id,
              eventType:   'laudo',
              title:       `Laudo analisado: ${doc.name}`,
              description: result.synthesis?.slice(0, 120) ?? '',
              linkedId:    reportId ?? undefined,
              linkedTable: 'medical_reports',
              icon:        'Brain',
              author:      (user as any)?.name ?? 'Usuário',
            });
          }

          alert("Análise concluída e salva no histórico!");
      } catch (e: any) {
          alert("Erro na análise: " + e.message);
      } finally {
          setAnalyzingDocId(null);
      }
  };

  const getStatusBadge = (status: string) => {
    if (status === 'FINAL') {
        return <span className="inline-flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold border border-green-200"><CheckCircle size={10}/> Concluído</span>;
    }
    return <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-600 px-2 py-1 rounded-full text-xs font-bold border border-gray-200"><Clock size={10}/> Rascunho</span>;
  };

  // Dashboard Calculations
  const totalServices = serviceRecords.length;
  const presentServices = serviceRecords.filter(r => r.attendance === 'Presente').length;
  const presenceRate = totalServices > 0 ? Math.round((presentServices / totalServices) * 100) : 0;

  // -------------------------
  // DOCUMENTOS (Laudos/Relatórios) - Upload / View / Download / Delete
  // -------------------------
  const resolveDocUrl = async (doc: any): Promise<string | null> => {
    const raw = doc?.url;
    if (raw && /^https?:\/\//i.test(raw)) return raw;
    const path = doc?.path ?? raw;
    if (!path) return null;
    return await StorageService.getPublicUrl('laudos', path);
  };

  const persistDocs = async (nextDocs: any[]) => {
    const updatedStudent = { ...student, documents: nextDocs };
    await databaseService.saveStudent(updatedStudent);
    onUpdateStudent?.(updatedStudent);
  };

  const handleUploadDocClick = () => {
    fileInputRef.current?.click();
  };

  const handleUploadDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    // Plano mínimo: PRO
    if (userPlan === PlanTier.FREE) {
      alert('Recurso disponível a partir do plano PRO.');
      return;
    }

    setIsUploadingDoc(true);
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9.]/g, '_');
      const path = `${student.id}/${Date.now()}_${cleanName}`;
      const uploadedPath = await StorageService.uploadFile(file, 'laudos', path);
      if (!uploadedPath) throw new Error('Falha ao enviar arquivo.');

      const publicUrl = await StorageService.getPublicUrl('laudos', uploadedPath);

      const newDoc = {
        name: file.name,
        date: new Date().toLocaleDateString('pt-BR'),
        type: docUploadType,
        url: publicUrl ?? undefined,
        path: uploadedPath,
      };

      const nextDocs = [newDoc, ...(student.documents ?? [])];
      await persistDocs(nextDocs);

      // Salvar em student_documents (tabela Sprint 2)
      if (!DEMO_MODE && (user as any)?.tenant_id) {
        const tenantId = (user as any).tenant_id;
        const docId = await StudentDocumentService.save({
          tenantId,
          studentId: student.id,
          name:         file.name,
          documentType: docUploadType,
          fileUrl:      publicUrl ?? undefined,
          filePath:     uploadedPath,
          fileSize:     file.size,
          mimeType:     file.type,
          uploadedBy:   (user as any)?.name ?? 'Usuário',
        });

        // Timeline: laudo enviado
        await TimelineService.add({
          tenantId,
          studentId:   student.id,
          eventType:   'laudo',
          title:       `Documento anexado: ${file.name}`,
          description: `Tipo: ${docUploadType}`,
          linkedId:    docId ?? undefined,
          linkedTable: 'student_documents',
          icon:        'Paperclip',
          author:      (user as any)?.name ?? 'Usuário',
        });
      }

      alert('Documento anexado com sucesso!');
    } catch (err: any) {
      console.error(err);
      alert('Erro ao anexar documento: ' + (err?.message ?? ''));
    } finally {
      setIsUploadingDoc(false);
    }
  };

  const handleDeleteDoc = async (doc: any) => {
    if (!confirm('Excluir este documento?')) return;
    try {
      const path = doc?.path ?? (doc?.url && !/^https?:\/\//i.test(doc.url) ? doc.url : null);
      if (path) await StorageService.removeFile('laudos', path);

      const nextDocs = (student.documents ?? []).filter((d: any) => d !== doc);
      await persistDocs(nextDocs);
    } catch (err: any) {
      console.error(err);
      alert('Erro ao excluir: ' + (err?.message ?? ''));
    }
  };

  const handleViewDoc = async (doc: any) => {
    const url = await resolveDocUrl(doc);
    if (!url) {
      alert('Não foi possível abrir este arquivo.');
      return;
    }
    setDocPreview({ name: doc?.name ?? 'Documento', url });
  };

  const handleDownloadDoc = async (doc: any) => {
    const url = await resolveDocUrl(doc);
    if (!url) {
      alert('Não foi possível baixar este arquivo.');
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = doc?.name ?? 'documento';
    a.target = '_blank';
    a.rel = 'noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="max-w-6xl mx-auto pb-20 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <button onClick={onBack} className="flex items-center gap-2 text-gray-500 hover:text-brand-600 transition">
          <ArrowLeft size={20} /> Voltar para Lista
        </button>
        <div className="flex gap-2">
            <button onClick={onEdit} className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg font-bold hover:bg-gray-50 transition shadow-sm">
            <Edit size={16} /> Editar Dados
            </button>
            <button onClick={handleDownloadFiche} className="bg-brand-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-brand-700 transition shadow-sm flex items-center gap-2">
                <Printer size={16}/> Baixar Ficha Completa
            </button>
        </div>
      </div>

      {/* Main Info Card */}
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-200 relative overflow-hidden print:border-black print:shadow-none">
        <div className="relative z-10 flex flex-col md:flex-row gap-8 items-start">
          <div className="w-32 h-32 rounded-full border-4 border-white shadow-lg overflow-hidden shrink-0 bg-gray-100 print:border-black">
            {student.photoUrl ? (
              <img src={student.photoUrl} alt={student.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-brand-100 text-brand-600 text-3xl font-bold">
                {student.name.charAt(0)}
              </div>
            )}
          </div>
          <div className="flex-1">
            <div className="flex flex-wrap gap-2 mb-2">
               {student.diagnosis.map(d => (
                 <span key={d} className="bg-purple-100 text-purple-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide print:border print:border-black print:bg-white print:text-black">
                   {d}
                 </span>
               ))}
               <span className="bg-brand-100 text-brand-700 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide print:border print:border-black print:bg-white print:text-black">
                 {student.supportLevel}
               </span>
               <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-wide ${student.tipo_aluno === 'em_triagem' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}`}>
                 {student.tipo_aluno === 'em_triagem' ? '🔍 Em Triagem' : '📋 Com Laudo'}
               </span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-1">{student.name}</h1>
            <p className="text-gray-500 flex items-center gap-4 text-sm mb-6 print:text-black">
              <span className="flex items-center gap-1"><Calendar size={14}/> {calculateAge(student.birthDate)} anos</span>
              <span className="flex items-center gap-1"><User size={14}/> Resp: {student.guardianName}</span>
            </p>
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex gap-6 mt-8 border-b border-gray-100 print:hidden overflow-x-auto">
            <button onClick={() => setActiveTab('info')} className={`pb-2 text-sm font-bold whitespace-nowrap ${activeTab === 'info' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-500'}`}>Informações & Histórico</button>
            <button onClick={() => setActiveTab('docs')} className={`pb-2 text-sm font-bold whitespace-nowrap ${activeTab === 'docs' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-500'}`}>Laudos & Relatórios</button>
            <button onClick={() => setActiveTab('timeline')} className={`pb-2 text-sm font-bold whitespace-nowrap flex items-center gap-1.5 ${activeTab === 'timeline' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-500'}`}>
              <Activity size={14}/> Linha do Tempo
            </button>
            {student.tipo_aluno === 'em_triagem' && (
              <button onClick={() => setActiveTab('fichas')} className={`pb-2 text-sm font-bold flex items-center gap-1.5 whitespace-nowrap ${activeTab === 'fichas' ? 'text-brand-600 border-b-2 border-brand-600' : 'text-gray-500'}`}>
                <ClipboardCheck size={14}/> Fichas Complementares
                {fichas.length > 0 && <span className="bg-brand-100 text-brand-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">{fichas.length}</span>}
              </button>
            )}
</div>
      </div>

      {activeTab === 'info' && (
          <div className="space-y-6">
              {/* Mini Dashboard */}
              <div className="grid md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Total Atendimentos</h4>
                      <div className="text-2xl font-bold text-gray-900">{totalServices}</div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Taxa de Presença</h4>
                      <div className="text-2xl font-bold text-green-600">{presenceRate}%</div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                      <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Protocolos Gerados</h4>
                      <div className="text-2xl font-bold text-brand-600">{studentProtocols.length}</div>
                  </div>
              </div>

              {/* History Section */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                  <div className="flex justify-between items-center mb-4">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2"><Clock size={18} className="text-brand-600"/> Histórico e Evolução</h3>
                      <button 
                        onClick={handleSaveHistory} 
                        disabled={isSavingHistory}
                        className="text-xs bg-brand-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-brand-700 flex items-center gap-1 disabled:opacity-50"
                      >
                          {isSavingHistory ? 'Salvando...' : <><Save size={14}/> Salvar Histórico</>}
                      </button>
                  </div>
                  <SmartTextarea 
                    value={historyText} 
                    onChange={setHistoryText} 
                    placeholder="Registre aqui o histórico evolutivo do aluno, observações diárias e anotações importantes..."
                    className="min-h-[200px]"
                  />
              </div>

              {/* Existing Protocol History */}
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mt-6">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-gray-500 uppercase bg-white border-b">
                      <tr>
                        <th className="px-6 py-4">Documento</th>
                        <th className="px-6 py-4">Status</th>
                        <th className="px-6 py-4">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {studentProtocols.length === 0 && <tr><td colSpan={3} className="px-6 py-4 text-center text-gray-400">Nenhum documento gerado.</td></tr>}
                      {studentProtocols.map(p => (
                        <tr key={p.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-bold">{p.type} <span className="text-xs font-normal text-gray-500 block">{new Date(p.createdAt).toLocaleDateString()}</span></td>
                          <td className="px-6 py-4">{getStatusBadge(p.status)}</td>
                          <td className="px-6 py-4 flex gap-2">
                              <button onClick={() => onViewProtocol(p)} className="text-brand-600 hover:text-brand-800 text-xs font-bold border border-brand-200 px-2 py-1 rounded">Abrir</button>
                              {/* Fluxo correto: Estudo de Caso → PAEE → PEI.
                                  Não exibimos ação direta de PEI a partir do Estudo de Caso. */}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
              </div>
          </div>
      )}

      {activeTab === 'docs' && (
          <div className="space-y-6 mt-6">
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                  <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Sparkles size={18} className="text-purple-600"/> Análise de Laudos e Relatórios (IA)</h3>
                  
                  
                  {/* Upload (PRO/MASTER) */}
                  <div className="mb-6">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                      <Paperclip size={14}/> Anexar Laudos / Relatórios
                    </h4>
                    <div className="flex flex-wrap items-center gap-3">
                      <select
                        value={docUploadType}
                        onChange={(e) => setDocUploadType(e.target.value as any)}
                        className="bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-semibold shadow-sm"
                      >
                        <option value="Laudo">Laudo</option>
                        <option value="Relatorio">Relatório</option>
                        <option value="Outro">Outro</option>
                      </select>

                      <button
                        onClick={handleUploadDocClick}
                        disabled={isUploadingDoc}
                        className="bg-brand-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-brand-700 transition shadow-sm flex items-center gap-2 disabled:opacity-50"
                      >
                        <FilePlus size={16}/> {isUploadingDoc ? 'Enviando...' : 'Anexar arquivo'}
                      </button>

                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={handleUploadDoc}
                      />

                      {userPlan === PlanTier.FREE && (
                        <span className="text-xs text-orange-700 font-bold bg-orange-50 px-2 py-1 rounded-lg border border-orange-100">
                          Disponível a partir do plano PRO
                        </span>
                      )}
                    </div>
                  </div>

{/* List of uploaded docs with Analyze / View / Download / Delete buttons */}
                  <div className="mb-6">
                      <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Documentos Anexados</h4>
                      <div className="grid gap-2">
                          {(!student.documents || student.documents.length === 0) && (
                            <div className="p-6 text-center rounded-xl border border-dashed border-gray-200">
                              <Paperclip size={24} className="mx-auto mb-2 text-gray-300"/>
                              <p className="text-sm text-gray-400">Nenhum documento anexado.</p>
                              <p className="text-xs text-gray-300 mt-0.5">Use o botão acima para anexar laudos e relatórios.</p>
                            </div>
                          )}
                          {student.documents?.map((doc, idx) => (
                              <div key={idx} className="flex flex-col gap-2 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                  <div className="flex justify-between items-center flex-wrap gap-2">
                                    <div className="flex items-center gap-3">
                                        <div className="w-9 h-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center shrink-0">
                                          <FileText size={16} className="text-gray-400"/>
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-gray-700">{doc.name}</p>
                                            <p className="text-xs text-gray-400">{doc.date} · <span className="font-semibold">{doc.type}</span></p>
                                        </div>
                                    </div>
                                    <div className="flex gap-2 flex-wrap">
                                        <button
                                          onClick={() => handleViewDoc(doc)}
                                          className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-50 flex items-center gap-1"
                                        >
                                          <Eye size={13}/> Ver
                                        </button>
                                        <button
                                          onClick={() => handleDownloadDoc(doc)}
                                          className="text-xs bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg font-bold hover:bg-gray-50 flex items-center gap-1"
                                        >
                                          <Download size={13}/> Baixar
                                        </button>
                                        <button
                                            onClick={() => handleAnalyzeDoc(doc, idx)}
                                            disabled={!!analyzingDocId}
                                            className="text-xs bg-purple-600 text-white px-3 py-1.5 rounded-lg font-bold hover:bg-purple-700 flex items-center gap-1 disabled:opacity-50"
                                        >
                                            {analyzingDocId === idx.toString() ? 'Analisando...' : <><FileSearch size={13}/> Analisar com IA</>}
                                        </button>
                                        <button
                                          onClick={() => handleDeleteDoc(doc)}
                                          className="text-xs bg-white border border-red-100 text-red-400 px-2 py-1.5 rounded-lg font-bold hover:bg-red-50 flex items-center gap-1"
                                        >
                                          <Trash2 size={13}/>
                                        </button>
                                    </div>
                                  </div>

                                  {/* Analysis result inline */}
                                  {analyses.filter(a => a.documentName === doc.name).map(analysis => (
                                      <div key={analysis.id} className="mt-2 border-t border-gray-200 pt-2">
                                          <div className="bg-white p-3 rounded border border-purple-100">
                                              <p className="text-xs font-bold text-purple-800 mb-1">Análise IA:</p>
                                              <p className="text-xs text-gray-600 italic mb-2">"{analysis.synthesis}"</p>
                                              <div className="grid grid-cols-2 gap-2">
                                                  <div>
                                                      <p className="text-[10px] font-bold uppercase text-gray-500">Pontos Pedagógicos</p>
                                                      <ul className="text-[10px] list-disc pl-3 text-gray-600">
                                                          {analysis.pedagogicalPoints.slice(0, 3).map((p, i) => <li key={i}>{p}</li>)}
                                                      </ul>
                                                  </div>
                                                  <div>
                                                      <p className="text-[10px] font-bold uppercase text-gray-500">Sugestões</p>
                                                      <ul className="text-[10px] list-disc pl-3 text-gray-600">
                                                          {analysis.suggestions.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
                                                      </ul>
                                                  </div>
                                              </div>
                                          </div>
                                      </div>
                                  ))}
                              </div>
                          ))}
                      </div>
                  </div>
              </div>
          </div>
      )}

      {activeTab === 'fichas' && (
        <div className="mt-6 space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2"><ClipboardCheck size={18} className="text-brand-600"/> Fichas Complementares Vinculadas</h3>
              <p className="text-xs text-gray-500 mt-0.5">Todas as fichas registradas para {student.name}</p>
            </div>
          </div>

          {fichas.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
              <ClipboardCheck size={32} className="mx-auto mb-3 text-gray-200"/>
              <p className="text-gray-400 text-sm">Nenhuma ficha complementar registrada ainda.</p>
              <p className="text-xs text-gray-300 mt-1">Use "Fichas Complementares" no menu para criar.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Tipo</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Data</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Por</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Código</th>
                    <th className="px-5 py-3 text-left text-xs font-bold text-gray-500 uppercase">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {fichas.map(f => (
                    <tr key={f.id} className="hover:bg-gray-50 transition">
                      <td className="px-5 py-3 font-semibold text-gray-800">{f.titulo}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{new Date(f.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{f.createdBy}</td>
                      <td className="px-5 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${f.status === 'finalizado' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                          {f.status === 'finalizado' ? '✅ Finalizado' : '📝 Rascunho'}
                        </span>
                      </td>
                      <td className="px-5 py-3 font-mono text-[10px] text-gray-400">{f.auditCode}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              // Imprimir ficha — abre FichasComplementaresView em modo visualização
                              alert(`Ficha: ${f.titulo}\nCódigo: ${f.auditCode}\nData: ${new Date(f.createdAt).toLocaleString('pt-BR')}\nPor: ${f.createdBy}`);
                            }}
                            className="text-brand-600 hover:text-brand-800 text-xs font-bold border border-brand-200 px-2 py-1 rounded-lg flex items-center gap-1"
                          >
                            <Eye size={12}/> Ver
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Excluir esta ficha?')) {
                                const updated = fichas.filter(x => x.id !== f.id);
                                setFichas(updated);
                                if (onUpdateStudent) onUpdateStudent({ ...student, fichasComplementares: updated });
                              }
                            }}
                            className="text-red-400 hover:text-red-600 text-xs border border-red-100 px-2 py-1 rounded-lg flex items-center gap-1"
                          >
                            <Trash2 size={12}/> Excluir
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Audit trail */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 mt-2">
            <p className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1.5"><ShieldCheck size={12} className="text-green-500"/> Auditoria das Fichas</p>
            <div className="space-y-1">
              {fichas.map(f => (
                <div key={f.id} className="text-[10px] text-gray-500 font-mono flex gap-3">
                  <span>{new Date(f.createdAt).toLocaleString('pt-BR')}</span>
                  <span className="text-gray-400">|</span>
                  <span>{f.tipo}</span>
                  <span className="text-gray-400">|</span>
                  <span>{f.auditCode}</span>
                  <span className="text-gray-400">|</span>
                  <span>hash: {f.contentHash.substring(0,12)}...</span>
                </div>
              ))}
              {fichas.length === 0 && <p className="text-[10px] text-gray-400 italic">Nenhum registro de auditoria.</p>}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'timeline' && (
        <StudentTimeline
          student={student}
          protocols={studentProtocols}
          serviceRecords={serviceRecords}
        />
      )}

      {/* Modal: Visualizar Documento (PDF/Imagem) */}
      {docPreview && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="font-bold text-gray-800 truncate">{docPreview.name}</div>
              <button
                onClick={() => setDocPreview(null)}
                className="p-2 rounded-lg hover:bg-gray-50 text-gray-500"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="h-[75vh] bg-gray-50">
              <iframe
                src={docPreview.url}
                title={docPreview.name}
                className="w-full h-full"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Vertical Timeline ────────────────────────────────────────────────────────
interface TimelineProps {
  student: Student;
  protocols: Protocol[];
  serviceRecords: ServiceRecord[];
}

const TYPE_COLORS: Record<string, { bg: string; border: string; color: string }> = {
  protocolo: { bg: '#EFF9FF', border: '#BAE6FD', color: '#1F4E5F' },
  atendimento: { bg: '#F0FDF4', border: '#BBF7D0', color: '#166534' },
  laudo: { bg: '#FDF6E3', border: '#FDE68A', color: '#92400E' },
  matricula: { bg: '#F3F4F6', border: '#E5E7EB', color: '#374151' },
};

function StudentTimeline({ student, protocols, serviceRecords }: TimelineProps) {
  type EventType = {
    id: string;
    date: string;
    type: 'protocolo' | 'atendimento' | 'laudo' | 'matricula';
    title: string;
    subtitle?: string;
  };

  const events: EventType[] = [
    // Registration
    ...(student.registrationDate
      ? [{
          id: 'reg',
          date: student.registrationDate,
          type: 'matricula' as const,
          title: 'Aluno cadastrado no sistema',
          subtitle: student.tipo_aluno === 'em_triagem' ? 'Modo Triagem' : 'Com Laudo',
        }]
      : []),
    // Protocols
    ...protocols.map(p => ({
      id: p.id,
      date: p.createdAt,
      type: 'protocolo' as const,
      title: String(p.type),
      subtitle: p.status === 'FINAL' ? 'Finalizado' : 'Rascunho',
    })),
    // Docs (laudos)
    ...(student.documents ?? []).map((d, i) => ({
      id: `doc_${i}`,
      date: d.date ? new Date(d.date.split('/').reverse().join('-')).toISOString() : new Date().toISOString(),
      type: 'laudo' as const,
      title: d.name,
      subtitle: d.type,
    })),
    // Service records
    ...serviceRecords.map(r => ({
      id: r.id,
      date: r.date,
      type: 'atendimento' as const,
      title: `${r.type} — ${r.professional}`,
      subtitle: r.attendance,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return iso;
    }
  };

  const typeLabel: Record<EventType['type'], string> = {
    protocolo: 'Documento',
    atendimento: 'Atendimento',
    laudo: 'Laudo/Relatório',
    matricula: 'Cadastro',
  };

  return (
    <div className="mt-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
            <Activity size={18} className="text-brand-600" /> Linha do Tempo
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">Histórico completo de {student.name}</p>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-gray-100 text-gray-600 font-bold">
          {events.length} eventos
        </span>
      </div>

      {events.length === 0 && (
        <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-10 text-center">
          <Activity size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-gray-400 text-sm">Nenhum evento registrado ainda.</p>
        </div>
      )}

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-5 top-2 bottom-2 w-0.5 bg-gray-100" />

        <div className="space-y-3">
          {events.map((ev, i) => {
            const cfg = TYPE_COLORS[ev.type] ?? TYPE_COLORS.matricula;
            return (
              <div key={`${ev.id}_${i}`} className="flex gap-4">
                {/* Dot */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 z-10 border-2"
                  style={{ background: cfg.bg, borderColor: cfg.border }}
                >
                  {ev.type === 'protocolo' && <FileText size={14} style={{ color: cfg.color }} />}
                  {ev.type === 'atendimento' && <CheckCircle size={14} style={{ color: cfg.color }} />}
                  {ev.type === 'laudo' && <Paperclip size={14} style={{ color: cfg.color }} />}
                  {ev.type === 'matricula' && <User size={14} style={{ color: cfg.color }} />}
                </div>

                {/* Card */}
                <div
                  className="flex-1 rounded-xl p-3 mb-1"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: cfg.border, color: cfg.color }}
                      >
                        {typeLabel[ev.type]}
                      </span>
                      <p className="text-sm font-bold mt-1" style={{ color: '#1F2937' }}>
                        {ev.title}
                      </p>
                      {ev.subtitle && (
                        <p className="text-xs mt-0.5" style={{ color: '#667085' }}>{ev.subtitle}</p>
                      )}
                    </div>
                    <span className="text-[10px] whitespace-nowrap" style={{ color: '#667085' }}>
                      {fmtDate(ev.date)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}