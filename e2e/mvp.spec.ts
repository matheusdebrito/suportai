import {test,expect} from '@playwright/test';
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
 await page.getByLabel('E-mail').fill(memberEmail);
 // O formulário inicia com perfil Colaborador; não depender do nome acessível das opções.
 await page.getByRole('button',{name:'Criar usuário'}).click();
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
   test.setTimeout(120_000);
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
       const data=await response.json() as {drafts:{title:string;index_status:string}[]};
       return data.drafts.find(d=>d.title===documentTitle)?.index_status||'MISSING';
     },{timeout:60_000,intervals:[500,1000,1500]}).toBe('READY');
   };

   await page.getByRole('button',{name:'Conhecimento',exact:true}).click();
   await page.getByLabel('Título').fill(title);
   await page.getByLabel('Procedimento').fill(
     'Confira o DNS em cada ambiente de homologação, registre os endereços consultados e valide os testes de conectividade.'
   );
   await page.getByRole('button',{name:'Criar rascunho'}).click();
   await waitIndexed(title);
   await page.getByRole('button',{name:'Atualizar'}).click();
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
   await page.getByRole('button',{name:'Atualizar'}).click();
   const pdfDraft=page.locator('.draft-item',{hasText:pdfName});
   await expect(pdfDraft).toContainText('READY');
   await pdfDraft.getByRole('button',{name:'Enviar para revisão'}).click();
   await page.getByRole('button',{name:'Revisão',exact:true}).click();
   const pdfReview=page.locator('.review',{hasText:pdfName});
   await expect(pdfReview).toBeVisible();
   await pdfReview.getByRole('button',{name:'Publicar'}).click();
   await page.getByRole('button',{name:'Conhecimento',exact:true}).click();
   await expect(page.locator('button.item',{hasText:pdfName})).toBeVisible();
 });
});
