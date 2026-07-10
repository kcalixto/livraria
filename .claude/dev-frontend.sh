#!/bin/sh
# Garante Node 20 do nvm no PATH (o default do shell é 16)
export PATH="$HOME/.nvm/versions/node/v20.19.2/bin:$PATH"
exec npm --prefix /Users/kaua.calixto/go/src/livraria/frontend run dev
