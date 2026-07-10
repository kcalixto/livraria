#!/usr/bin/env bash
# Cria 10 livros mockados no ambiente DEV via API do backoffice.
# Uso: ./seed-mock-books.sh
# A api key vem de LIVRARIA_BACKOFFICE_API_KEY ou, se ausente, do SSM.
set -euo pipefail

API_URL="${API_URL:-https://a07s4i4gvb.execute-api.sa-east-1.amazonaws.com}"
API_KEY="${LIVRARIA_BACKOFFICE_API_KEY:-$(aws ssm get-parameter \
  --name /livraria/backoffice-api-key \
  --with-decryption \
  --region sa-east-1 \
  --query Parameter.Value \
  --output text)}"

create_book() {
  local payload="$1"
  local title
  title=$(printf '%s' "$payload" | sed -E 's/.*"title":"([^"]+)".*/\1/')
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/backoffice/livros" \
    -H "x-api-key: $API_KEY" \
    -H 'content-type: application/json' \
    -d "$payload")
  echo "[$status] $title"
}

create_book '{"title":"A Comuna e o Fogo","author":"Aurélio Bandeira","price":4200,"format":"Ensaio","edition":"2ª edição","year":2023,"pages":288,"description":"Setenta e dois dias em que uma cidade se governou sozinha. Bandeira reconstrói a Comuna não como epopeia distante, mas como oficina de perguntas ainda abertas: quem decide, quem executa, quem responde.\n\nO que interessa ao autor não é o desfecho trágico já sabido, e sim a densidade das semanas em que tudo pareceu possível. As assembleias de bairro, os clubes de mulheres, a imprensa que multiplicava vozes — cada instituição improvisada é examinada com atenção quase artesanal.\n\nUma leitura sobre a coragem de administrar o próprio destino, e sobre o preço que se paga por ela."}'

create_book '{"title":"Cartas de um Tipógrafo","author":"Manuela Reis","price":3600,"format":"Epistolar","edition":"1ª edição","year":2022,"pages":176,"description":"Entre 1908 e 1919, um tipógrafo escreve à irmã sobre chumbo, tinta e greves. As cartas, reunidas e anotadas por Manuela Reis, formam um autorretrato involuntário de uma classe que aprendeu a ler compondo o que outros escreviam.\n\nHá ternura e há aspereza. O ofício aparece em detalhe — o cheiro da oficina, o ritmo das linotipos — mas também a lenta politização de quem manuseia palavras alheias o dia inteiro.\n\nUm livro pequeno e denso, sobre trabalho, palavra impressa e a formação de uma consciência."}'

create_book '{"title":"Memórias da Greve Geral","author":"Joaquim Nunes","price":4500,"format":"História oral","edition":"1ª edição","year":2021,"pages":240,"description":"Testemunhos de quem cruzou os braços quando cruzar os braços era crime. Nunes recolheu depoimentos de operárias e operários que participaram das paralisações e os organizou em um mosaico de vozes que se corrigem e se contradizem.\n\nNão é história oficial: é memória em disputa, com todas as suas falhas e insistências. O leitor monta os fatos como quem remenda um tecido puído.\n\nDocumento raro sobre a solidariedade improvisada e sobre o que sobra quando a poeira assenta."}'

create_book '{"title":"O Direito à Cidade","author":"Tomás Vieira","price":3900,"format":"Ensaio","edition":"1ª edição","year":2024,"pages":208,"description":"Quem tem direito à rua, à praça, ao centro? Vieira parte de uma pergunta simples para desmontar a ideia de que a cidade é um dado natural, e não uma decisão renovada todos os dias por quem manda e por quem resiste.\n\nO ensaio caminha do aluguel ao transporte, do calçamento ao horário do metrô, mostrando como cada detalhe urbano carrega uma escolha política.\n\nUma introdução lúcida ao urbano como campo de batalha — e como possibilidade."}'

create_book '{"title":"Noturno Operário","author":"Clara Sampaio","price":3200,"format":"Poesia","edition":"1ª edição","year":2023,"pages":96,"description":"Poemas escritos no turno da noite, entre o apito e o silêncio. Sampaio faz da fábrica um lugar lírico sem nunca adoçá-la: o verso é curto, o fôlego é medido, a fadiga tem métrica.\n\nHá greve e há amor, às vezes na mesma linha. A voz que atravessa o livro é a de quem sabe que o dia seguinte começa cedo.\n\nPoesia de trabalho e de espera, para ler em voz alta."}'

create_book '{"title":"Contra a Corrente","author":"Edite Falcão","price":4100,"format":"Biografias","edition":"1ª edição","year":2022,"pages":224,"description":"Retratos de mulheres que disseram não quando o não custava caro. Falcão reúne biografias breves de organizadoras sindicais, professoras e donas de casa que empurraram a história de baixo para cima.\n\nCada capítulo é uma vida inteira comprimida em poucas páginas, sem heroísmo fácil. O que emerge é um método: a paciência, a rede, o cuidado com o detalhe.\n\nLeitura de cabeceira para quem desconfia das versões vencedoras."}'

create_book '{"title":"O Pão e as Rosas","author":"Beatriz Andrade","price":3800,"format":"Ensaio","edition":"1ª edição","year":2024,"pages":192,"description":"A história por trás da palavra de ordem que pedia, ao mesmo tempo, o necessário e o belo. Andrade investiga as origens da frase e sua viagem por continentes e décadas, de grevistas têxteis a cartazes de hoje.\n\nO livro defende que dignidade e prazer não são luxos separáveis da luta por direitos — são o seu conteúdo.\n\nUm ensaio caloroso sobre por que a beleza também é uma reivindicação."}'

create_book '{"title":"Manual do Agitador Cultural","author":"Rui Mendonça","price":3400,"format":"Manual","edition":"1ª edição","year":2023,"pages":160,"description":"Como organizar um sarau, ocupar uma esquina, imprimir um lambe. Mendonça escreve um guia prático — quase um caderno de campo — para quem quer transformar cultura em ferramenta de organização.\n\nCada seção traz um roteiro testado, com erros incluídos. O tom é direto, sem palavras de ordem vazias.\n\nFerramenta de trabalho para coletivos, ocupações e centros culturais."}'

create_book '{"title":"A Terra é de Quem Trabalha","author":"Sebastião Lima","price":4800,"format":"História","edition":"1ª edição","year":2021,"pages":312,"description":"Do latifúndio ao acampamento, uma história das lutas pela terra contada a partir de quem a cultiva. Lima cruza documentos oficiais e memória camponesa para expor um conflito que atravessa séculos.\n\nO livro não idealiza o campo: mostra a dureza, a violência e também a inventividade das formas coletivas de posse e cultivo.\n\nReferência para entender por que a questão agrária nunca saiu de cena."}'

create_book '{"title":"Vozes do Subúrbio","author":"Amara Teixeira","price":3700,"format":"Crônicas","edition":"1ª edição","year":2024,"pages":184,"description":"Crônicas de trem, de laje e de quintal. Teixeira escreve a periferia por dentro, sem o filtro da reportagem que chega de fora e vai embora antes do anoitecer.\n\nSão textos curtos, de humor seco e ternura afiada, que recusam tanto a miséria quanto o pitoresco.\n\nUm retrato vivo de quem faz a cidade funcionar e raramente aparece nela."}'

echo "Pronto. Catálogo dev:"
curl -s "$API_URL/livros" | python3 -c "import json,sys; print(len(json.load(sys.stdin)), 'livros no catálogo')"
