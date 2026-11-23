# FROTA BLU-GASPAR

Aplicação em React com API Python/FastAPI e banco SQLite local.

## Executar no Windows

Instale as dependências uma vez:

```powershell
python -m pip install -r requirements.txt
npm install
```

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
