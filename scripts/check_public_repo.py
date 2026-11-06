#!/usr/bin/env python3
"""Conservative public-file audit. Run before deployment and review findings."""
import pathlib, re, sys
ROOT=pathlib.Path(__file__).resolve().parents[1]
SKIP={'.git','node_modules','venv','.venv'}
EXT={'.html','.js','.py','.json','.yml','.yaml','.env','.txt','.pem','.key'}
# Focus on unmistakable private keys or assigned credentials; avoids generic 'token' variable names.
RULES=[
 ('private-key-block',re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |ENCRYPTED )?PRIVATE KEY-----')),
 ('github-personal-token',re.compile(r'gh[pousr]_[A-Za-z0-9_]{30,}')),
 ('aws-access-key',re.compile(r'AKIA[0-9A-Z]{16}')),
 ('literal-secret',re.compile(r"(?i)(?:client_secret|api_key|access_token|password)\s*[=:]\s*\"[^\"\n]{16,}\"")),
]
errors=[]
for file in ROOT.rglob('*'):
 if not file.is_file() or any(x in SKIP for x in file.relative_to(ROOT).parts):continue
 if file.suffix.lower() not in EXT or file.stat().st_size>3_000_000:continue
 text=file.read_text('utf-8',errors='replace')
 for name,pattern in RULES:
  for match in pattern.finditer(text):
   lineno=text.count('\n',0,match.start())+1
   errors.append(f'{file.relative_to(ROOT)}:{lineno}: {name}')
if errors:
 print('BLOCKED — possible sensitive content (values intentionally not printed):')
 print('\n'.join(errors));sys.exit(1)
print('Basic public-file patterns: OK. Manual review, Git history audit and license checks remain necessary.')
