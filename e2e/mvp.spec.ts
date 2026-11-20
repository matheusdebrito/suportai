import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {spawn,type ChildProcess} from 'node:child_process';
import {PDFDocument,StandardFonts} from 'pdf-lib';

test('cadastro, primeiro acesso, conhecimento, conversa e feedback sobrevivem ao reload',async({page})=>{
 const adminEmail=process.env.E2E_ADMIN_EMAIL||'e2e-admin@example.test';
 const adminPassword=process.env.E2E_ADMIN_PASSWORD||'E2e-Secure-Password-Example-123!';
 const memberEmail='e2e-'+Date.now()+'@example.test';
 const memberPassword='Mvp-Secure-Password-Example-123!';
 const documentTitle='Procedimento de homologação '+Date.now();
 const question='Como diagnosticar uma falha de NTP?';

 await page.goto('/');
 await expect(page.getByRole('heading',{name:'Seu conhecimento, mais acessível.'})).toBeVisible();
 await page.getByLabel('E-mail').fill(adminEmail);
 await page.getByLabel('Senha').fill(adminPassword);
 await page.getByRole('button',{name:'Entrar'}).click();
 await expect(page.getByRole('button',{name:'Usuários',exact:true})).toBeVisible();

 await page.getByRole('button',{name:'Usuários',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Cadastrar colaborador'})).toBeVisible();
 const deptName='Suporte E2E '+Date.now();
 await page.getByLabel('Nome do departamento').fill(deptName);
 await page.getByRole('button',{name:'Criar departamento'}).click();
 await expect(page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Departamentos'})})
   .locator('.item').filter({hasText:deptName})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Operação do SuportAI'})).toBeVisible();
 await page.getByLabel('E-mail').fill(memberEmail);
 // O formulário inicia com perfil Colaborador; não depender do nome acessível das opções.
 await page.getByRole('button',{name:'Criar usuário'}).click();
 const departmentSelect=page.getByLabel('Departamentos de '+memberEmail);
 const departmentValue=await departmentSelect.locator('option',{hasText:deptName}).getAttribute('value');
 expect(departmentValue).toBeTruthy();
 await Promise.all([
   page.waitForResponse(r=>r.url().includes('/departments')&&r.request().method()==='PUT'&&r.ok()),
   departmentSelect.selectOption([departmentValue!])
 ]);
 await expect(page.getByLabel('Departamentos de '+memberEmail)).toHaveValues([departmentValue!]);
 const access=page.getByLabel('Conceder acesso a '+memberEmail);
 const grantOption=access.locator('option',{hasText:'Conhecimento geral — Leitura e edição'});
 const grantValue=await grantOption.getAttribute('value');
 expect(grantValue).toBeTruthy();
 await Promise.all([
   page.waitForResponse(r=>r.url().includes('/grants')&&r.request().method()==='POST'&&r.ok()),
   access.selectOption(grantValue!)
 ]);
 const code=page.locator('.pending code');
 await expect(code).toBeVisible();
 const temporaryCode=(await code.innerText()).trim();
 expect(temporaryCode.length).toBeGreaterThan(20);

 await page.getByRole('button',{name:'Sair'}).click();
 // Logout must revoke the server-side cookie, not only clear React state.
 await page.reload();
 await expect(page.getByRole('button',{name:'Entrar'})).toBeVisible();
 await page.getByRole('button',{name:'Tenho um código temporário'}).click();
 await page.getByLabel('Código temporário').fill(temporaryCode);
 await page.getByLabel('Nova senha (12+ caracteres)').fill(memberPassword);
 await page.getByRole('button',{name:'Ativar minha conta / trocar senha'}).click();
 await expect(page.getByRole('button',{name:'Conhecimento',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Usuários',exact:true})).toHaveCount(0);

 await page.getByRole('button',{name:'Conhecimento',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Adicionar conhecimento'})).toBeVisible();
 await page.getByLabel('Título').fill(documentTitle);
 await page.getByLabel('Procedimento').fill(
   'Em homologação, valide os servidores DNS e registre a data, a origem, o resultado e o responsável pelo teste.'
 );
 await page.getByRole('button',{name:'Criar rascunho'}).click();
 await expect(page.locator('.draft-item',{hasText:documentTitle})).toBeVisible();

 await page.reload();
 await page.getByRole('button',{name:'Conhecimento',exact:true}).click();
 await expect(page.locator('.draft-item',{hasText:documentTitle})).toBeVisible();

 await page.getByRole('button',{name:'Assistente',exact:true}).click();
 await page.getByPlaceholder('Digite sua pergunta...').fill(question);
 await page.getByRole('button',{name:'Enviar mensagem'}).click();
 await expect(page.locator('.bubble.assistant').last()).toContainText('Não encontrei um procedimento confirmado no cérebro');
 const rating=page.getByRole('button',{name:'Resposta útil'});
 await rating.click();
 await expect(rating).toHaveAttribute('aria-pressed','true');

 await page.reload();
 await expect(page.locator('.conversations-panel .conversation-item').first()).toBeVisible();
 await page.locator('.conversations-panel .conversation-item').first().click();
 await expect(page.locator('.bubble.assistant').last()).toContainText('Não encontrei um procedimento confirmado no cérebro');
 await expect(page.getByRole('button',{name:'Resposta útil'})).toHaveAttribute('aria-pressed','true');
 page.once('dialog',dialog=>{void dialog.accept();});
 await page.getByRole('button',{name:/Excluir conversa/}).first().click();
 await expect(page.locator('.conversations-panel .conversation-item')).toHaveCount(0);
 await page.reload();
 await expect(page.locator('.conversations-panel .conversation-item')).toHaveCount(0);
});


test.describe('fluxo editorial com worker real',()=>{
 let worker:ChildProcess|undefined;
 test.beforeAll(()=>{
   worker=spawn(process.execPath,['--import','tsx','src/worker.ts'],{
     cwd:'apps/api',
     env:{...process.env,NODE_ENV:'development'},
     stdio:'ignore'
   });
 });
 test.afterAll(()=>{worker?.kill('SIGTERM');});
 test('aprovador publica artigo, identifica duplicidade e publica PDF',async({page})=>{
   test.setTimeout(230_000);
   const title='Procedimento de rede homologado '+Date.now();
   const approverEmail='e2e-approver-'+Date.now()+'@example.test';
   const approverPassword='Mvp-Secure-Approver-Password-123!';
   const pdfName='checklist-de-infraestrutura.pdf';

   await page.goto('/');
   await page.getByLabel('E-mail').fill(process.env.E2E_ADMIN_EMAIL||'e2e-admin@example.test');
   await page.getByLabel('Senha').fill(process.env.E2E_ADMIN_PASSWORD||'E2e-Secure-Password-Example-123!');
   await page.getByRole('button',{name:'Entrar'}).click();
   await page.getByRole('button',{name:'Usuários',exact:true}).click();
   await page.getByLabel('E-mail').fill(approverEmail);
   await page.locator('section.panel').filter({has:page.getByRole('heading',{name:'Cadastrar colaborador'})}).locator('select').selectOption('APPROVER');
   await page.getByRole('button',{name:'Criar usuário'}).click();
   const access=page.getByLabel('Conceder acesso a '+approverEmail);
   const grantOption=access.locator('option',{hasText:'Conhecimento geral — Leitura, edição e aprovação'});
   const grantValue=await grantOption.getAttribute('value');
   expect(grantValue).toBeTruthy();
   await Promise.all([
     page.waitForResponse(r=>r.url().includes('/grants')&&r.request().method()==='POST'&&r.ok()),
     access.selectOption(grantValue!)
   ]);
   const temporary=(await page.locator('.pending code').innerText()).trim();
   expect(temporary.length).toBeGreaterThan(20);
   await page.getByRole('button',{name:'Sair'}).click();
   await page.getByRole('button',{name:'Tenho um código temporário'}).click();
   await page.getByLabel('Código temporário').fill(temporary);
   await page.getByLabel('Nova senha (12+ caracteres)').fill(approverPassword);
   await page.getByRole('button',{name:'Ativar minha conta / trocar senha'}).click();
   await expect(page.getByRole('button',{name:'Revisão',exact:true})).toBeVisible();

   const waitIndexed=async(documentTitle:string)=>{
     await expect.poll(async()=>{
       const response=await page.request.get('http://localhost:5173/knowledge/mine');
       const data=await response.json() as {drafts:{title:string;status:string;index_status:string}[]};
       // Multiple versions can share a title; only wait for the new DRAFT.
       return data.drafts.find(d=>d.title===documentTitle&&d.status==='DRAFT')?.index_status||'MISSING';
     },{timeout:60_000,intervals:[500,1000,1500]}).toBe('READY');
   };

   await page.getByRole('button',{name:'Conhecimento',exact:true}).click();
   await page.getByLabel('Título').fill(title);
   await page.getByLabel('Procedimento').fill(
     'Confira o DNS em cada ambiente de homologação, registre os endereços consultados e valide os testes de conectividade.'
   );
   await page.getByRole('button',{name:'Criar rascunho'}).click();
   await waitIndexed(title);
   await page.getByRole('button',{name:'Atualizar',exact:true}).click();
   const draft=page.locator('.draft-item',{hasText:title});
   await expect(draft).toContainText('READY');
   await draft.getByRole('button',{name:'Enviar para revisão'}).click();
   await page.getByRole('button',{name:'Revisão',exact:true}).click();
   const submitted=page.locator('.review',{hasText:title});
   await expect(submitted).toBeVisible();
   await submitted.getByRole('button',{name:'Publicar'}).click();

   await page.getByRole('button',{name:'Conhecimento',exact:true}).click();
   await expect(page.locator('button.item',{hasText:title})).toBeVisible();
   await page.getByLabel('Título').fill(title);
   await page.getByLabel('Procedimento').fill(
     'Este segundo rascunho de DNS tem o mesmo título e deve solicitar reconhecimento explícito de duplicidade.'
   );
   await page.getByRole('button',{name:'Criar rascunho'}).click();
   await expect(page.locator('.duplicate-panel')).toBeVisible();
   await expect(page.locator('.duplicate-item',{hasText:title})).toBeVisible();
   await page.locator('.duplicate-item',{hasText:title}).getByRole('button',{name:'Abrir artigo'}).click();
   await expect(page.locator('.document')).toContainText(title);

   // Negative uploads exercise the actual browser/API boundary.
   const chooser=page.locator('label.upload input[type=file]');
   await chooser.setInputFiles({name:'forged-upload.txt',mimeType:'text/plain',
     buffer:Buffer.from('%PDF-1.7\\nnot-a-real-pdf')});
   await expect(page.getByRole('alert')).toContainText('Formato não suportado');
   const blankPdf=await PDFDocument.create();
   blankPdf.addPage([600,400]);
   const blankName='sem-texto-'+Date.now()+'.pdf';
   await chooser.setInputFiles({name:blankName,mimeType:'application/pdf',
     buffer:Buffer.from(await blankPdf.save({useObjectStreams:false}))});
   await expect.poll(async()=>{
     const response=await page.request.get('http://localhost:5173/knowledge/mine');
     const result=await response.json() as {drafts:{title:string;index_status:string}[]};
     return result.drafts.find(d=>d.title===blankName)?.index_status;
   },{timeout:30_000}).toBe('FAILED');
   await page.getByRole('button',{name:'Atualizar',exact:true}).click();
   const blankDraft=page.locator('.draft-item',{hasText:blankName});
   await expect(blankDraft).toContainText('FAILED');
   await expect(blankDraft.getByRole('button',{name:'Enviar para revisão'})).toHaveCount(0);

   const encryptedName='protegido-'+Date.now()+'.pdf';
   const encrypted=await readFile(new URL('../apps/api/test-fixtures/encrypted-lab.pdf',import.meta.url));
   await chooser.setInputFiles({name:encryptedName,mimeType:'application/pdf',buffer:encrypted});
   await expect.poll(async()=>{
     const response=await page.request.get('http://localhost:5173/knowledge/mine');
     const result=await response.json() as {drafts:{title:string;index_status:string}[]};
     return result.drafts.find(d=>d.title===encryptedName)?.index_status;
   },{timeout:30_000}).toBe('FAILED');
   await page.getByRole('button',{name:'Atualizar',exact:true}).click();
   const encryptedDraft=page.locator('.draft-item',{hasText:encryptedName});
   await expect(encryptedDraft).toContainText('FAILED');
   await expect(encryptedDraft.getByRole('button',{name:'Enviar para revisão'})).toHaveCount(0);

   const tooLarge=Buffer.alloc(8*1024*1024+8192,0x20);
   tooLarge.write('%PDF-1.7');
   const uploadResponse=page.waitForResponse(r=>r.url().includes('/knowledge/pdfs')&&r.request().method()==='POST');
   await chooser.setInputFiles({name:'mais-de-8mb.pdf',mimeType:'application/pdf',buffer:tooLarge});
   expect((await uploadResponse).status()).toBe(413);
   const pdf=await PDFDocument.create();
   const pagePdf=pdf.addPage([600,400]);
   const font=await pdf.embedFont(StandardFonts.Helvetica);
   pagePdf.drawText('Procedimento de infraestrutura: verifique logs, backups, disponibilidade e integridade do ambiente antes da entrega.',{
     x:30,y:330,size:12,font,maxWidth:540
   });
   const bytes=Buffer.from(await pdf.save({useObjectStreams:false}));
   await page.locator('label.upload input[type=file]').setInputFiles({
     name:pdfName,mimeType:'application/pdf',buffer:bytes
   });
   await waitIndexed(pdfName);
   await page.getByRole('button',{name:'Atualizar',exact:true}).click();
   const pdfDraft=page.locator('.draft-item',{hasText:pdfName});
   await expect(pdfDraft).toContainText('READY');
   await pdfDraft.getByRole('button',{name:'Enviar para revisão'}).click();
   await page.getByRole('button',{name:'Revisão',exact:true}).click();
   const pdfReview=page.locator('.review',{hasText:pdfName});
   await expect(pdfReview).toBeVisible();
   await pdfReview.getByRole('button',{name:'Publicar'}).click();
   await page.getByRole('button',{name:'Conhecimento',exact:true}).click();
   await expect(page.locator('button.item',{hasText:pdfName})).toBeVisible();

   // Revising an article must render its before/after summary without overwriting the live document.
   await page.locator('button.item',{hasText:title}).click();
   await page.getByRole('button',{name:'Criar revisão deste artigo'}).click();
   await page.getByLabel('Procedimento').fill('Revisão para homologação: verifique os servidores DNS, confirme a resolução e registre o resultado na auditoria.');
   await page.getByText('Comparar alterações com a versão publicada').click();
   await expect(page.locator('.diff-added')).toContainText('Revisão para homologação');
   await expect(page.locator('.diff-removed')).toContainText('Confira o DNS');
   await page.getByRole('button',{name:'Salvar proposta de revisão'}).click();
   await waitIndexed(title);
   await page.getByRole('button',{name:'Atualizar',exact:true}).click();
   const articleDraft=page.locator('.draft-item',{hasText:title});
   await articleDraft.getByRole('button',{name:'Enviar para revisão'}).click();
   await page.getByRole('button',{name:'Revisão',exact:true}).click();
   const revisionReview=page.locator('.review',{hasText:title});
   await expect(revisionReview).toBeVisible();
   await revisionReview.getByText('O que mudou em relação à versão publicada?').click();
   await expect(revisionReview.locator('.diff-added')).toContainText('Revisão para homologação');
   await revisionReview.getByRole('button',{name:'Publicar'}).click();

   // A published PDF can be updated in-place while its current version stays visible.
   await page.getByRole('button',{name:'Conhecimento',exact:true}).click();
   await page.locator('button.item',{hasText:pdfName}).click();
   await page.getByRole('button',{name:'Enviar nova versão deste PDF'}).click();
   const newPdf=await PDFDocument.create();
   const revisedPdfPage=newPdf.addPage([600,400]);
   const pdfFont=await newPdf.embedFont(StandardFonts.Helvetica);
   revisedPdfPage.drawText('Checklist de infraestrutura revisado: registre auditoria, backups, disponibilidade e logs de suporte.',{
     x:30,y:330,size:12,font:pdfFont,maxWidth:540
   });
   await page.locator('label.upload input[type=file]').setInputFiles({
     name:'proposta-corrigida.pdf',mimeType:'application/pdf',
     buffer:Buffer.from(await newPdf.save({useObjectStreams:false}))
   });
   await waitIndexed(pdfName);
   await page.getByRole('button',{name:'Atualizar',exact:true}).click();
   const currentPdfDraft=page.locator('.draft-item',{hasText:pdfName});
   await currentPdfDraft.getByRole('button',{name:'Enviar para revisão'}).click();
   await page.getByRole('button',{name:'Revisão',exact:true}).click();
   const currentPdfReview=page.locator('.review',{hasText:pdfName});
   await currentPdfReview.getByRole('button',{name:'Solicitar ajustes'}).click();
   await currentPdfReview.getByPlaceholder('Escreva um parecer claro para o autor...').fill('Adicione a verificação de integridade dos backups ao checklist de infraestrutura.');
   await currentPdfReview.getByRole('button',{name:'Enviar pedido de ajustes'}).click();
   await page.getByRole('button',{name:'Conhecimento',exact:true}).click();
   const correctionDraft=page.locator('.draft-item',{hasText:pdfName});
   await expect(correctionDraft).toContainText('Ajustes solicitados');
   await expect(correctionDraft).toContainText('verificação de integridade');
   await correctionDraft.getByRole('button',{name:'Enviar PDF corrigido'}).click();
   await expect(page.getByText('Selecionar arquivo corrigido: '+pdfName)).toBeVisible();
   const finalPdf=await PDFDocument.create();
   const finalPage=finalPdf.addPage([600,400]);
   const finalFont=await finalPdf.embedFont(StandardFonts.Helvetica);
   finalPage.drawText('Checklist atualizado: valide a integridade dos backups, analise logs e registre evidencias de cada verificacao.',{
     x:30,y:330,size:12,font:finalFont,maxWidth:540
   });
   await page.locator('label.upload input[type=file]').setInputFiles({
     name:'versao-final.pdf',mimeType:'application/pdf',
     buffer:Buffer.from(await finalPdf.save({useObjectStreams:false}))
   });
   await waitIndexed(pdfName);
   await page.getByRole('button',{name:'Atualizar',exact:true}).click();
   const finalDraft=page.locator('.draft-item',{hasText:pdfName});
   await expect(finalDraft).not.toContainText('Ajustes solicitados');
   await finalDraft.getByRole('button',{name:'Enviar para revisão'}).click();
   await page.getByRole('button',{name:'Revisão',exact:true}).click();
   await page.locator('.review',{hasText:pdfName}).getByRole('button',{name:'Publicar'}).click();
   await page.getByRole('button',{name:'Conhecimento',exact:true}).click();
   await page.locator('button.item',{hasText:pdfName}).click();
   await expect(page.locator('.document')).toContainText('integridade dos backups');

   // Archive and restore from the real browser. No archived knowledge can
   // remain visible as a published document between these actions.
   page.once('dialog',dialog=>{void dialog.accept();});
   await page.getByRole('button',{name:'Arquivar documento'}).click();
   await expect(page.locator('button.item',{hasText:pdfName})).toHaveCount(0);

   await page.getByRole('button',{name:'Revisão',exact:true}).click();
   const archivedPdf=page.locator('.draft-item',{hasText:pdfName});
   await expect(archivedPdf).toContainText('Arquivado em');
   page.once('dialog',dialog=>{void dialog.accept();});
   await archivedPdf.getByRole('button',{name:'Restaurar versão publicada'}).click();
   await expect(archivedPdf).toHaveCount(0);

   await page.getByRole('button',{name:'Conhecimento',exact:true}).click();
   await expect(page.locator('button.item',{hasText:pdfName})).toBeVisible();
 });
});
