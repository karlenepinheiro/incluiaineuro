import React, { useEffect, useState } from 'react';
import { DocumentService, PedagocicalDocument } from '../services/documentService';
import { exportDocumentToPDF } from '../utils/pdfExport';
import { FileText, Printer, Edit2, Trash2, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { DocButton, DocIconButton } from './ui/DocButton';

interface StudentDocumentsPanelProps {
  student: any;
  school?: any;
  onRegenerateRequest: (type: string) => void; // Trigger pro seu hook de Gateway
}

export const StudentDocumentsPanel: React.FC<StudentDocumentsPanelProps> = ({ student, school, onRegenerateRequest }) => {
  const [documents, setDocuments] = useState<PedagocicalDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const data = await DocumentService.listByStudent(student.id);
      setDocuments(data);
    } catch (error: any) {
      toast.error('Erro ao carregar documentos oficiais.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (student?.id) loadDocuments();
  }, [student?.id]);

  const handleDelete = async (id: string) => {
    if (!window.confirm('Excluir este documento permanentemente?')) return;
    try {
      await DocumentService.deleteDocument(id);
      toast.success('Documento excluído.');
      loadDocuments();
    } catch (error) {
      toast.error('Erro ao excluir documento.');
    }
  };

  const handleExportPDF = async (doc: PedagocicalDocument) => {
    const loadingToast = toast.loading('Montando PDF...');
    try {
      await exportDocumentToPDF(doc, student, school);
      toast.success('PDF baixado com sucesso!', { id: loadingToast });
    } catch (error) {
      toast.error('Falha na renderização do PDF.', { id: loadingToast });
    }
  };

  if (loading) {
    return <div className="p-8 flex justify-center text-gray-400"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-4">
      <div className="flex justify-between items-center mb-6 border-b pb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-800">Documentos Oficiais da IA</h3>
          <p className="text-xs text-gray-500">PAEE, PEI e Estudos de Caso gerados e salvos.</p>
        </div>
        <div className="flex gap-2">
          <DocButton variant="primary" size="sm" icon={<Sparkles size={13}/>} onClick={() => onRegenerateRequest('PEI')}>
            Novo Documento
          </DocButton>
        </div>
      </div>

      {documents.length === 0 ? (
        <div className="text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-200">
          <FileText size={32} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">Nenhum documento finalizado para este aluno.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between p-4 rounded-xl border border-gray-100 bg-gray-50 hover:bg-blue-50/30 transition">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-blue-100 text-[#1F4E5F] flex items-center justify-center">
                  <FileText size={18} />
                </div>
                <div>
                  <p className="font-bold text-sm text-gray-800 uppercase">{doc.doc_type || doc.type}</p>
                  <p className="text-xs text-gray-500">
                    Gerado em {new Date(doc.created_at).toLocaleDateString('pt-BR')} • {doc.status === 'DRAFT' ? 'Rascunho' : 'Finalizado'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <DocIconButton
                  variant="ghost"
                  icon={<Edit2 size={15}/>}
                  label="Editar Documento"
                  onClick={() => toast('Função de edição visual será aberta aqui (JSON Editor)')}
                />
                <DocIconButton
                  variant="outline"
                  icon={<Printer size={15}/>}
                  label="Baixar PDF Oficial"
                  onClick={() => handleExportPDF(doc)}
                />
                <div className="w-px h-5 bg-gray-200 mx-0.5" />
                <DocIconButton
                  variant="destructive"
                  icon={<Trash2 size={15}/>}
                  label="Excluir Documento"
                  onClick={() => handleDelete(doc.id)}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};