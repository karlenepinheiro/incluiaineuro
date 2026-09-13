import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect,vi} from 'vitest';
import fs from 'node:fs';
import {StudentGridCard} from '../views/StudentsListView';
vi.mock('../services/supabase',()=>({supabase:{}}));
vi.mock('../components/StudentImportModal',()=>({StudentImportModal:()=>null}));
vi.mock('../components/StudentCodeSearchModal',()=>({StudentCodeSearchModal:()=>null}));
const student:any={id:'responsive-fixture',name:'NomeMuitoLongoSemEspacos'.repeat(5),guardianName:'Responsável com sobrenome muito longo '.repeat(4),guardianPhone:'(99) 99999-0000 / +55 99 99999-0000 ramal '+ '9'.repeat(55),grade:'SérieAnoTurmaMuitoLonga'.repeat(5),birthDate:'2015-01-01',shift:'Manhã',diagnosis:[],schoolName:'Escola'};
it('card preserves long values and uses shrinkable columns without truncating contact data',()=>{
 const html=renderToStaticMarkup(<StudentGridCard student={student} onSelect={()=>{}} onEdit={()=>{}} onDelete={()=>{}}/>);
 expect(html).toContain(student.guardianPhone);expect(html).toContain(student.guardianName.trim());expect(html).toContain(student.grade);expect(html).toContain(student.name);
 expect(html).toContain('repeat(2, minmax(0, 1fr))');expect(html).toContain('overflow-wrap:anywhere');
 if(process.env.STUDENT_PREVIEW_FIXTURES)fs.writeFileSync('docs/audits/2026-09-12-student-preview/card.html',html);
});
