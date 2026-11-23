# FROTA BLU-GASPAR

Aplicação em React com API Python/FastAPI. Usa SQLite local por padrão e pode conectar ao PostgreSQL do Supabase.

## Executar no Windows

Instale as dependências uma vez:

```powershell
python -m pip install -r requirements.txt
npm install
```

## Conectar ao Supabase

1. Copie `.env.example` para `.env` (`Copy-Item .env.example .env` no PowerShell).
2. No Supabase, abra **Project Settings → Database** e obtenha a senha do banco.
3. Substitua `YOUR_DATABASE_PASSWORD` em `.env` pela senha real. Não envie essa senha pelo chat nem a publique no GitHub. Se ela tiver caracteres especiais, use o formato URL-encoded.
4. Reinicie a API. Ela cria a tabela necessária e, na primeira conexão ao PostgreSQL, importa os registros existentes do SQLite sem apagar o arquivo local.

O projeto Supabase usado é `oefnumrrldrgqfeyobha`. A URL de exemplo usa o Session Pooler IPv4 do projeto. A chave publishable não é necessária na aplicação: o backend acessa o PostgreSQL pelo servidor, mantendo a senha apenas no `.env` local. O comando de conexão não requer `supabase login`, `supabase init` ou `supabase link`.

Abra dois terminais no diretório do projeto. No primeiro, inicie a API:

```powershell
python -m uvicorn backend.main:app --reload
```

No segundo, inicie a interface:

```powershell
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://localhost:5173`.

Os registros são salvos em `backend\carretas.db`. Os cards contam apenas os cadastros feitos no dia e zeram à meia-noite no horário local; as carretas continuam na lista e no banco. A API também pode ser consultada em `http://localhost:8000/docs`.
