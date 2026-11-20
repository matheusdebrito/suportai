import {test,expect} from '@playwright/test';

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
 await page.getByLabel('Perfil').selectOption('USER');
 await page.getByRole('button',{name:'Criar usuário'}).click();
 const code=page.locator('.pending code');
 await expect(code).toBeVisible();
 const temporaryCode=(await code.innerText()).trim();
 expect(temporaryCode.length).toBeGreaterThan(20);

 await page.getByRole('button',{name:'Sair'}).click();
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
