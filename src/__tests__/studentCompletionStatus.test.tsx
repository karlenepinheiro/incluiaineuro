import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {it,expect} from 'vitest';
import {getStudentCompletionStatus} from '../services/studentCompletionStatus';
import {StudentCompletionBadge} from '../components/StudentCompletionBadge';
const complete={name:'Ana',birthDate:'2015-03-21',grade:'4º ano',schoolName:'Escola Exemplo',shift:'Manhã',guardianName:'Maria',guardianPhone:'63999999999',schoolHistory:'Registro escolar',abilities:['Comunicação'],difficulties:['Atenção']};
it.each(['name','birthDate','grade','schoolName','shift','guardianName','guardianPhone'])('missing %s makes basic registration red',key=>{
 const student={...complete,[key]:'  '};
 const status=getStudentCompletionStatus(student);
 expect(status.isComplete).toBe(false);expect(status.missingFields).toHaveLength(1);
 expect(status.missingFields[0].key).toBe(key);
 const html=renderToStaticMarkup(<StudentCompletionBadge student={student as any}/>);
 expect(html).toContain('text-red-800');expect(html).toContain(status.incompleteSections[0].label.replace('&', '&amp;'));
});
it('key fields in required blocks, no optional clinical data: complete and green',()=>{
 expect(getStudentCompletionStatus(complete)).toEqual({isComplete:true,missingFields:[],incompleteSections:[]});
 const html=renderToStaticMarkup(<StudentCompletionBadge student={complete as any}/>);
 expect(html).toContain('text-emerald-800');expect(html).not.toContain('popover=');
});
it('accepts age, school id and guardian email as their respective alternatives',()=>{
 expect(getStudentCompletionStatus({...complete,birthDate:'',age:10,schoolName:'',schoolId:'school',guardianPhone:'',guardianEmail:'maria@example.org'})).toEqual({isComplete:true,missingFields:[],incompleteSections:[]});
});
it.each([undefined,' ',NaN,-1,'unknown'])('missing or invalid age %s is not a substitute for birth date',age=>{
 expect(getStudentCompletionStatus({...complete,birthDate:'',age}).missingFields.map(f=>f.key)).toEqual(['birthDate']);
});
it('zero years is a recorded age; external school is accepted for an external student',()=>{
 expect(getStudentCompletionStatus({...complete,birthDate:'',age:0,schoolName:'',isExternalStudent:true,externalSchoolName:'Outra escola'}).isComplete).toBe(true);
});
it('optional data never appears in the missing-fields list',()=>{
 expect(getStudentCompletionStatus({}).missingFields.map(f=>f.key)).toEqual(['name','birthDate','grade','schoolName','shift','guardianName','guardianPhone','context','abilities','difficulties']);
});

it('multiple missing school fields produce one school section, never individual UI fields',()=>{
 const student={...complete,grade:'',shift:'',schoolName:''};
 expect(getStudentCompletionStatus(student).incompleteSections).toEqual([{id:'school',label:'Dados Escolares & Equipe'}]);
 const html=renderToStaticMarkup(<StudentCompletionBadge student={student as any}/>);
 expect(html).toContain('Blocos a concluir');expect(html).toContain('1');expect(html).toContain('bloco pendente');
 expect(html).not.toContain('Série/ano/turma');expect(html).not.toContain('Turno');
});
it('school and pedagogical blocks produce exactly two sections and count two',()=>{
 const student={...complete,shift:'',abilities:[],difficulties:[]};
 expect(getStudentCompletionStatus(student).incompleteSections.map(s=>s.id)).toEqual(['school','pedagogical']);
 const html=renderToStaticMarkup(<StudentCompletionBadge student={student as any}/>);
 expect(html).toContain('2');expect(html).toContain('blocos pendentes');expect(html).toContain('Perfil Pedagógico');
});
it('empty optional fields and a recorded absence of barriers do not block completion',()=>{
 expect(getStudentCompletionStatus({...complete,difficulties:['Sem barreiras observadas'],diagnosis:[],medication:'',zipcode:'',city:'',regentTeacher:'',priorKnowledge:undefined}).isComplete).toBe(true);
});
it('one context entry is sufficient and missing both pedagogical fields lists one block',()=>{
 expect(getStudentCompletionStatus({...complete,schoolHistory:'',observations:'Registro inicial'}).isComplete).toBe(true);
 expect(getStudentCompletionStatus({...complete,abilities:[],difficulties:[]}).incompleteSections).toEqual([{id:'pedagogical',label:'Perfil Pedagógico'}]);
});
