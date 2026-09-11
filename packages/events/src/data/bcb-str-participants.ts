export const FINANCIAL_INSTITUTIONS_CATALOG_SOURCE = {
  "name": "Banco Central do Brasil",
  "dataset": "Lista de Participantes do STR",
  "portal": "https://dadosabertos.bcb.gov.br/dataset/lista-de-participantes-do-str",
  "url": "https://www.bcb.gov.br/content/estabilidadefinanceira/str1/ParticipantesSTR.csv",
  "retrievedAt": "2026-09-11",
  "identifierField": "Número_Código",
  "notes": "Número_Código substitui o antigo código COMPE. Instituições sem número-código (n/a) e o código 000 (infraestruturas B3) foram omitidas porque o provider atual (Asaas) identifica a conta de destino por bank.code de compensação, string de até 3 caracteres."
} as const;

export const FINANCIAL_INSTITUTIONS_CATALOG_DATA = [
  {
    "institutionCode": "001",
    "shortName": "BCO DO BRASIL S.A.",
    "institutionName": "Banco do Brasil S.A."
  },
  {
    "institutionCode": "003",
    "shortName": "BCO DA AMAZONIA S.A.",
    "institutionName": "BANCO DA AMAZONIA S.A."
  },
  {
    "institutionCode": "004",
    "shortName": "BCO DO NORDESTE DO BRASIL S.A.",
    "institutionName": "Banco do Nordeste do Brasil S.A."
  },
  {
    "institutionCode": "007",
    "shortName": "BNDES",
    "institutionName": "BANCO NACIONAL DE DESENVOLVIMENTO ECONOMICO E SOCIAL"
  },
  {
    "institutionCode": "010",
    "shortName": "CREDICOAMO",
    "institutionName": "CREDICOAMO CREDITO RURAL COOPERATIVA"
  },
  {
    "institutionCode": "011",
    "shortName": "UBS (BRASIL) CORRETORA DE VALORES S.A.",
    "institutionName": "UBS (BRASIL) CORRETORA DE VALORES S.A."
  },
  {
    "institutionCode": "012",
    "shortName": "BANCO INBURSA",
    "institutionName": "Banco Inbursa S.A."
  },
  {
    "institutionCode": "014",
    "shortName": "STATE STREET BR S.A. BCO COMERCIAL",
    "institutionName": "STATE STREET BRASIL S.A. - BANCO COMERCIAL"
  },
  {
    "institutionCode": "015",
    "shortName": "UBS BB CCTVM S.A.",
    "institutionName": "UBS BB CORRETORA DE CÂMBIO, TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "016",
    "shortName": "CCM DESP TRÂNS SC E RS",
    "institutionName": "COOPERATIVA DE CRÉDITO MÚTUO DOS DESPACHANTES DE TRÂNSITO DE SANTA CATARINA E RIO GRANDE DO SUL - SICOOB CREDITRAN"
  },
  {
    "institutionCode": "017",
    "shortName": "BNY MELLON BCO S.A.",
    "institutionName": "BNY Mellon Banco S.A."
  },
  {
    "institutionCode": "018",
    "shortName": "BCO TRICURY S.A.",
    "institutionName": "Banco Tricury S.A."
  },
  {
    "institutionCode": "021",
    "shortName": "BCO BANESTES S.A.",
    "institutionName": "BANESTES S.A. BANCO DO ESTADO DO ESPIRITO SANTO"
  },
  {
    "institutionCode": "023",
    "shortName": "CONTA SIMPLES SCD S.A.",
    "institutionName": "CONTA SIMPLES SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "024",
    "shortName": "BCO BANDEPE S.A.",
    "institutionName": "Banco Bandepe S.A."
  },
  {
    "institutionCode": "025",
    "shortName": "BCO ALFA S.A.",
    "institutionName": "Banco Alfa S.A."
  },
  {
    "institutionCode": "033",
    "shortName": "BCO SANTANDER (BRASIL) S.A.",
    "institutionName": "BANCO SANTANDER (BRASIL) S.A."
  },
  {
    "institutionCode": "036",
    "shortName": "BCO BBI S.A.",
    "institutionName": "Banco Bradesco BBI S.A."
  },
  {
    "institutionCode": "037",
    "shortName": "BCO DO EST. DO PA S.A.",
    "institutionName": "Banco do Estado do Pará S.A."
  },
  {
    "institutionCode": "040",
    "shortName": "BCO CARGILL S.A.",
    "institutionName": "Banco Cargill S.A."
  },
  {
    "institutionCode": "041",
    "shortName": "BCO DO ESTADO DO RS S.A.",
    "institutionName": "Banco do Estado do Rio Grande do Sul S.A."
  },
  {
    "institutionCode": "047",
    "shortName": "BCO DO EST. DE SE S.A.",
    "institutionName": "Banco do Estado de Sergipe S.A."
  },
  {
    "institutionCode": "060",
    "shortName": "CONFIDENCE CC S.A.",
    "institutionName": "CONFIDENCE SOCIEDADE CORRETORA DE CAMBIO S.A."
  },
  {
    "institutionCode": "063",
    "shortName": "BANCO BRADESCARD",
    "institutionName": "Banco Bradescard S.A."
  },
  {
    "institutionCode": "064",
    "shortName": "GOLDMAN SACHS DO BRASIL BM S.A",
    "institutionName": "GOLDMAN SACHS DO BRASIL BANCO MULTIPLO S.A."
  },
  {
    "institutionCode": "065",
    "shortName": "BCO ANDBANK S.A.",
    "institutionName": "Banco AndBank (Brasil) S.A."
  },
  {
    "institutionCode": "066",
    "shortName": "BCO MORGAN STANLEY S.A.",
    "institutionName": "BANCO MORGAN STANLEY S.A."
  },
  {
    "institutionCode": "069",
    "shortName": "BCO CREFISA S.A.",
    "institutionName": "Banco Crefisa S.A."
  },
  {
    "institutionCode": "070",
    "shortName": "BRB - BCO DE BRASILIA S.A.",
    "institutionName": "BRB - BANCO DE BRASILIA S.A."
  },
  {
    "institutionCode": "074",
    "shortName": "BCO. J.SAFRA S.A.",
    "institutionName": "Banco J. Safra S.A."
  },
  {
    "institutionCode": "075",
    "shortName": "BANCO ABN AMRO CLEARING S.A.",
    "institutionName": "BANCO ABN AMRO CLEARING S.A."
  },
  {
    "institutionCode": "076",
    "shortName": "BCO KDB BRASIL S.A.",
    "institutionName": "Banco KDB do Brasil S.A."
  },
  {
    "institutionCode": "077",
    "shortName": "BANCO INTER",
    "institutionName": "Banco Inter S.A."
  },
  {
    "institutionCode": "078",
    "shortName": "HAITONG BI DO BRASIL S.A.",
    "institutionName": "Haitong Banco de Investimento do Brasil S.A."
  },
  {
    "institutionCode": "079",
    "shortName": "PICPAY BANK - BANCO MÚLTIPLO S.A",
    "institutionName": "PICPAY BANK - BANCO MÚLTIPLO S.A"
  },
  {
    "institutionCode": "080",
    "shortName": "BT CC LTDA.",
    "institutionName": "BT CORRETORA DE CÂMBIO LTDA."
  },
  {
    "institutionCode": "081",
    "shortName": "BANCOSEGURO S.A.",
    "institutionName": "BancoSeguro S.A."
  },
  {
    "institutionCode": "082",
    "shortName": "BANCO TOPÁZIO S.A.",
    "institutionName": "BANCO TOPÁZIO S.A."
  },
  {
    "institutionCode": "083",
    "shortName": "BCO DA CHINA BRASIL S.A.",
    "institutionName": "Banco da China Brasil S.A."
  },
  {
    "institutionCode": "084",
    "shortName": "SISPRIME DO BRASIL - COOP",
    "institutionName": "SISPRIME DO BRASIL - COOPERATIVA DE CRÉDITO"
  },
  {
    "institutionCode": "085",
    "shortName": "COOPCENTRAL AILOS",
    "institutionName": "Cooperativa Central de Crédito - Ailos"
  },
  {
    "institutionCode": "088",
    "shortName": "BANCO RANDON S.A.",
    "institutionName": "BANCO RANDON S.A."
  },
  {
    "institutionCode": "089",
    "shortName": "CREDISAN CC",
    "institutionName": "CREDISAN COOPERATIVA DE CRÉDITO"
  },
  {
    "institutionCode": "093",
    "shortName": "POLOCRED SCMEPP LTDA.",
    "institutionName": "PÓLOCRED   SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E À EMPRESA DE PEQUENO PORTE LTDA."
  },
  {
    "institutionCode": "094",
    "shortName": "BANCO FINAXIS",
    "institutionName": "Banco Finaxis S.A."
  },
  {
    "institutionCode": "095",
    "shortName": "BANCO TRAVELEX S.A.",
    "institutionName": "BANCO TRAVELEX S.A."
  },
  {
    "institutionCode": "096",
    "shortName": "BCO B3 S.A.",
    "institutionName": "Banco B3 S.A."
  },
  {
    "institutionCode": "097",
    "shortName": "CREDISIS - CENTRAL DE COOPERATIVAS DE CRÉDITO",
    "institutionName": "CREDISIS - CENTRAL DE COOPERATIVAS DE CRÉDITO"
  },
  {
    "institutionCode": "099",
    "shortName": "UNIPRIME COOPCENTRAL LTDA.",
    "institutionName": "UNIPRIME CENTRAL NACIONAL - CENTRAL NACIONAL DE COOPERATIVA DE CREDITO"
  },
  {
    "institutionCode": "100",
    "shortName": "PLANNER CV S.A.",
    "institutionName": "Planner Corretora de Valores S.A."
  },
  {
    "institutionCode": "101",
    "shortName": "WARREN RENA DTVM",
    "institutionName": "WARREN RENA DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA"
  },
  {
    "institutionCode": "102",
    "shortName": "XP INVESTIMENTOS CCTVM S/A",
    "institutionName": "XP INVESTIMENTOS CORRETORA DE CÂMBIO,TÍTULOS E VALORES MOBILIÁRIOS S/A"
  },
  {
    "institutionCode": "104",
    "shortName": "CAIXA ECONOMICA FEDERAL",
    "institutionName": "CAIXA ECONOMICA FEDERAL"
  },
  {
    "institutionCode": "105",
    "shortName": "LECCA CFI S.A.",
    "institutionName": "Lecca Crédito, Financiamento e Investimento S/A"
  },
  {
    "institutionCode": "107",
    "shortName": "BCO BOCOM BBM S.A.",
    "institutionName": "Banco Bocom BBM S.A."
  },
  {
    "institutionCode": "111",
    "shortName": "OLIVEIRA TRUST DTVM S.A.",
    "institutionName": "OLIVEIRA TRUST DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIARIOS S.A."
  },
  {
    "institutionCode": "113",
    "shortName": "NEON CTVM S.A.",
    "institutionName": "NEON CORRETORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "119",
    "shortName": "BCO WESTERN UNION",
    "institutionName": "Banco Western Union do Brasil S.A."
  },
  {
    "institutionCode": "120",
    "shortName": "BCO RODOBENS S.A.",
    "institutionName": "BANCO RODOBENS S.A."
  },
  {
    "institutionCode": "121",
    "shortName": "BCO AGIBANK S.A.",
    "institutionName": "Banco Agibank S.A."
  },
  {
    "institutionCode": "122",
    "shortName": "BCO BRADESCO BERJ S.A.",
    "institutionName": "Banco Bradesco BERJ S.A."
  },
  {
    "institutionCode": "124",
    "shortName": "BCO WOORI BANK DO BRASIL S.A.",
    "institutionName": "Banco Woori Bank do Brasil S.A."
  },
  {
    "institutionCode": "125",
    "shortName": "BANCO GENIAL",
    "institutionName": "BANCO GENIAL S.A."
  },
  {
    "institutionCode": "126",
    "shortName": "BR PARTNERS BI",
    "institutionName": "BR Partners Banco de Investimento S.A."
  },
  {
    "institutionCode": "127",
    "shortName": "CODEPE CVC S.A.",
    "institutionName": "Codepe Corretora de Valores e Câmbio S.A."
  },
  {
    "institutionCode": "128",
    "shortName": "BRAZA BANK S.A. BCO DE CÂMBIO",
    "institutionName": "BRAZA BANK S.A. BANCO DE CÂMBIO"
  },
  {
    "institutionCode": "129",
    "shortName": "UBS BB BI S.A.",
    "institutionName": "UBS BB BANCO DE INVESTIMENTO S.A."
  },
  {
    "institutionCode": "130",
    "shortName": "CARUANA SCFI",
    "institutionName": "CARUANA S.A. - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "131",
    "shortName": "TULLETT PREBON BRASIL CVC LTDA",
    "institutionName": "TULLETT PREBON BRASIL CORRETORA DE VALORES E CÂMBIO LTDA"
  },
  {
    "institutionCode": "132",
    "shortName": "ICBC DO BRASIL BM S.A.",
    "institutionName": "ICBC do Brasil Banco Múltiplo S.A."
  },
  {
    "institutionCode": "133",
    "shortName": "CRESOL CONFEDERAÇÃO",
    "institutionName": "CONFEDERAÇÃO NACIONAL DAS COOPERATIVAS CENTRAIS DE CRÉDITO E ECONOMIA FAMILIAR E SOLIDÁRIA - CRESOL CONFEDERAÇÃO"
  },
  {
    "institutionCode": "134",
    "shortName": "BGC LIQUIDEZ DTVM LTDA",
    "institutionName": "BGC LIQUIDEZ DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA"
  },
  {
    "institutionCode": "136",
    "shortName": "UNICRED DO BRASIL",
    "institutionName": "COOPERATIVA CENTRAL DE CRÉDITO UNICRED DO BRASIL - UNICRED DO BRASIL"
  },
  {
    "institutionCode": "138",
    "shortName": "GET MONEY CC LTDA.",
    "institutionName": "GET MONEY SOCIEDADE CORRETORA DE CÂMBIO S.A."
  },
  {
    "institutionCode": "139",
    "shortName": "INTESA SANPAOLO BRASIL S.A. BM",
    "institutionName": "Intesa Sanpaolo Brasil S.A. - Banco Múltiplo"
  },
  {
    "institutionCode": "140",
    "shortName": "NU INVESTIMENTOS S.A. - CTVM",
    "institutionName": "NU INVESTIMENTOS S.A. - CORRETORA DE TÍTULOS E VALORES MOBILIÁRIOS"
  },
  {
    "institutionCode": "141",
    "shortName": "MASTER BI S.A. - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "BANCO MASTER DE INVESTIMENTO S.A. - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "142",
    "shortName": "BROKER BRASIL CC LTDA.",
    "institutionName": "Broker Brasil Corretora de Câmbio Ltda."
  },
  {
    "institutionCode": "143",
    "shortName": "INTEX BANK BCO DE CÂMBIO S.A.",
    "institutionName": "INTEX BANK BANCO DE CÂMBIO S.A."
  },
  {
    "institutionCode": "144",
    "shortName": "EBURY BCO DE CÂMBIO S.A.",
    "institutionName": "EBURY BANCO DE CÂMBIO S.A."
  },
  {
    "institutionCode": "145",
    "shortName": "LEVYCAM CCV LTDA",
    "institutionName": "LEVYCAM - CORRETORA DE CAMBIO E VALORES LTDA."
  },
  {
    "institutionCode": "146",
    "shortName": "GUITTA CC LTDA",
    "institutionName": "GUITTA CORRETORA DE CAMBIO LTDA."
  },
  {
    "institutionCode": "149",
    "shortName": "FACTA S.A. CFI",
    "institutionName": "Facta Financeira S.A. - Crédito Financiamento e Investimento"
  },
  {
    "institutionCode": "157",
    "shortName": "ICAP DO BRASIL CTVM LTDA.",
    "institutionName": "ICAP do Brasil Corretora de Títulos e Valores Mobiliários Ltda."
  },
  {
    "institutionCode": "159",
    "shortName": "CASA CREDITO S.A. SCM",
    "institutionName": "Casa do Crédito S.A. Sociedade de Crédito ao Microempreendedor"
  },
  {
    "institutionCode": "173",
    "shortName": "APEX GROUP DTVM",
    "institutionName": "APEX GROUP DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "174",
    "shortName": "PEFISA S.A. - C.F.I.",
    "institutionName": "PEFISA S.A. - CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "180",
    "shortName": "CM CAPITAL MARKETS CCTVM LTDA",
    "institutionName": "CM CAPITAL MARKETS CORRETORA DE CÂMBIO, TÍTULOS E VALORES MOBILIÁRIOS LTDA"
  },
  {
    "institutionCode": "183",
    "shortName": "SOCRED SA - SCMEPP",
    "institutionName": "SOCRED S.A. - SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E À EMPRESA DE PEQUENO PORTE"
  },
  {
    "institutionCode": "188",
    "shortName": "ATIVA S.A. INVESTIMENTOS CCTVM",
    "institutionName": "ATIVA INVESTIMENTOS S.A. CORRETORA DE TÍTULOS, CÂMBIO E VALORES"
  },
  {
    "institutionCode": "189",
    "shortName": "HS FINANCEIRA",
    "institutionName": "HS FINANCEIRA S/A CREDITO, FINANCIAMENTO E INVESTIMENTOS"
  },
  {
    "institutionCode": "190",
    "shortName": "SERVICOOP",
    "institutionName": "SERVICOOP - COOPERATIVA DE CRÉDITO DOS SERVIDORES PÚBLICOS ESTADUAIS E MUNICIPAIS DO RIO GRANDE DO SUL"
  },
  {
    "institutionCode": "191",
    "shortName": "NOVA FUTURA CTVM LTDA.",
    "institutionName": "Nova Futura Corretora de Títulos e Valores Mobiliários Ltda."
  },
  {
    "institutionCode": "194",
    "shortName": "UNIDA DTVM LTDA",
    "institutionName": "UNIDA DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA."
  },
  {
    "institutionCode": "195",
    "shortName": "VALOR S/A SCFI",
    "institutionName": "VALOR S/A SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "196",
    "shortName": "FAIR SOCIEDADE CC",
    "institutionName": "FAIR SOCIEDADE CORRETORA DE CÂMBIO S.A."
  },
  {
    "institutionCode": "197",
    "shortName": "STONE IP S.A.",
    "institutionName": "STONE INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "208",
    "shortName": "BANCO BTG PACTUAL S.A.",
    "institutionName": "Banco BTG Pactual S.A."
  },
  {
    "institutionCode": "212",
    "shortName": "BANCO ORIGINAL",
    "institutionName": "Banco Original S.A."
  },
  {
    "institutionCode": "213",
    "shortName": "BCO ARBI S.A.",
    "institutionName": "Banco Arbi S.A."
  },
  {
    "institutionCode": "217",
    "shortName": "BANCO JOHN DEERE S.A.",
    "institutionName": "Banco John Deere S.A."
  },
  {
    "institutionCode": "218",
    "shortName": "BCO BS2 S.A.",
    "institutionName": "Banco BS2 S.A."
  },
  {
    "institutionCode": "222",
    "shortName": "BCO CRÉDIT AGRICOLE BR S.A.",
    "institutionName": "BANCO CRÉDIT AGRICOLE BRASIL S.A."
  },
  {
    "institutionCode": "224",
    "shortName": "BCO FIBRA S.A.",
    "institutionName": "Banco Fibra S.A."
  },
  {
    "institutionCode": "233",
    "shortName": "BANCO BMG SOLUÇÕES FINANCEIRAS S.A.",
    "institutionName": "BANCO BMG SOLUÇÕES FINANCEIRAS S.A."
  },
  {
    "institutionCode": "237",
    "shortName": "BCO BRADESCO S.A.",
    "institutionName": "Banco Bradesco S.A."
  },
  {
    "institutionCode": "241",
    "shortName": "BCO CLASSICO S.A.",
    "institutionName": "BANCO CLASSICO S.A."
  },
  {
    "institutionCode": "243",
    "shortName": "BANCO MASTER - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "BANCO MASTER S/A - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "246",
    "shortName": "BCO ABC BRASIL S.A.",
    "institutionName": "Banco ABC Brasil S.A."
  },
  {
    "institutionCode": "249",
    "shortName": "BANCO INVESTCRED UNIBANCO S.A.",
    "institutionName": "Banco Investcred Unibanco S.A."
  },
  {
    "institutionCode": "250",
    "shortName": "BANCO BMG CONSIGNADO S.A.",
    "institutionName": "BANCO BMG CONSIGNADO S.A."
  },
  {
    "institutionCode": "254",
    "shortName": "PARANA BCO S.A.",
    "institutionName": "PARANÁ BANCO S.A."
  },
  {
    "institutionCode": "259",
    "shortName": "MONEYCORP BCO DE CÂMBIO S.A.",
    "institutionName": "MONEYCORP BANCO DE CÂMBIO S.A."
  },
  {
    "institutionCode": "260",
    "shortName": "NU PAGAMENTOS - IP",
    "institutionName": "NU PAGAMENTOS S.A. - INSTITUIÇÃO DE PAGAMENTO"
  },
  {
    "institutionCode": "265",
    "shortName": "BCO FATOR S.A.",
    "institutionName": "Banco Fator S.A."
  },
  {
    "institutionCode": "266",
    "shortName": "BCO CEDULA S.A.",
    "institutionName": "BANCO CEDULA S.A."
  },
  {
    "institutionCode": "268",
    "shortName": "BARI CIA HIPOTECÁRIA",
    "institutionName": "BARI COMPANHIA HIPOTECÁRIA"
  },
  {
    "institutionCode": "269",
    "shortName": "BCO HSBC S.A.",
    "institutionName": "BANCO HSBC S.A."
  },
  {
    "institutionCode": "271",
    "shortName": "BPY CCTVM S.A.",
    "institutionName": "BPY CORRETORA DE CÂMBIO, TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "272",
    "shortName": "AGK CC S.A.",
    "institutionName": "AGK CORRETORA DE CAMBIO S.A."
  },
  {
    "institutionCode": "273",
    "shortName": "COOP SULCREDI AMPLEA",
    "institutionName": "COOPERATIVA DE CREDITO SULCREDI AMPLEA"
  },
  {
    "institutionCode": "274",
    "shortName": "BMP SCMEPP LTDA",
    "institutionName": "BMP SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E A EMPRESA DE PEQUENO PORTE LTDA."
  },
  {
    "institutionCode": "276",
    "shortName": "BCO SENFF S.A.",
    "institutionName": "BANCO SENFF S.A."
  },
  {
    "institutionCode": "278",
    "shortName": "GENIAL INVESTIMENTOS CVM S.A.",
    "institutionName": "Genial Investimentos Corretora de Valores Mobiliários S.A."
  },
  {
    "institutionCode": "280",
    "shortName": "WILL FINANCEIRA S.A.CFI - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "WILL FINANCEIRA S.A. CRÉDITO, FINANCIAMENTO E INVESTIMENTO - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "281",
    "shortName": "CCR COOPAVEL",
    "institutionName": "Cooperativa de Crédito Rural Coopavel"
  },
  {
    "institutionCode": "283",
    "shortName": "RB INVESTIMENTOS DTVM LTDA.",
    "institutionName": "RB INVESTIMENTOS DISTRIBUIDORA DE TITULOS E VALORES MOBILIARIOS LIMITADA"
  },
  {
    "institutionCode": "288",
    "shortName": "CAROL DTVM LTDA.",
    "institutionName": "CAROL DISTRIBUIDORA DE TITULOS E VALORES MOBILIARIOS LTDA."
  },
  {
    "institutionCode": "289",
    "shortName": "EFX CC LTDA.",
    "institutionName": "EFX CORRETORA DE CÂMBIO LTDA."
  },
  {
    "institutionCode": "290",
    "shortName": "PAGSEGURO INTERNET IP S.A.",
    "institutionName": "PAGSEGURO INTERNET INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "292",
    "shortName": "GALAPAGOS DTVM S.A.",
    "institutionName": "GALAPAGOS CAPITAL DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "293",
    "shortName": "LASTRO RDV DTVM LTDA",
    "institutionName": "Lastro RDV Distribuidora de Títulos e Valores Mobiliários Ltda."
  },
  {
    "institutionCode": "296",
    "shortName": "OZ CORRETORA DE CÂMBIO S.A.",
    "institutionName": "OZ CORRETORA DE CÂMBIO S.A."
  },
  {
    "institutionCode": "298",
    "shortName": "VIPS CC S.A.",
    "institutionName": "VIPS CORRETORA DE CÂMBIO S.A."
  },
  {
    "institutionCode": "299",
    "shortName": "BCO AFINZ S.A. - BM",
    "institutionName": "BANCO AFINZ S.A. - BANCO MÚLTIPLO"
  },
  {
    "institutionCode": "300",
    "shortName": "BCO LA NACION ARGENTINA",
    "institutionName": "Banco de la Nacion Argentina"
  },
  {
    "institutionCode": "301",
    "shortName": "DOCK IP S.A.",
    "institutionName": "DOCK INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "305",
    "shortName": "FOURTRADE COR. DE CAMBIO LTDA",
    "institutionName": "FOURTRADE CORRETORA DE CÂMBIO LTDA."
  },
  {
    "institutionCode": "307",
    "shortName": "TERRA INVESTIMENTOS DTVM",
    "institutionName": "Terra Investimentos Distribuidora de Títulos e Valores Mobiliários Ltda."
  },
  {
    "institutionCode": "310",
    "shortName": "VORTX DTVM LTDA.",
    "institutionName": "VORTX DISTRIBUIDORA DE TITULOS E VALORES MOBILIARIOS LTDA."
  },
  {
    "institutionCode": "312",
    "shortName": "HSCM SCMEPP LTDA.",
    "institutionName": "HSCM - SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E À EMPRESA DE PEQUENO PORTE LTDA."
  },
  {
    "institutionCode": "318",
    "shortName": "BCO BMG S.A.",
    "institutionName": "Banco BMG S.A."
  },
  {
    "institutionCode": "319",
    "shortName": "OM DTVM LTDA",
    "institutionName": "OM DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA"
  },
  {
    "institutionCode": "320",
    "shortName": "BOC BRASIL",
    "institutionName": "BANK OF CHINA (BRASIL) BANCO MÚLTIPLO S/A"
  },
  {
    "institutionCode": "321",
    "shortName": "CREFAZ SCMEPP SA",
    "institutionName": "CREFAZ SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E A EMPRESA DE PEQUENO PORTE S.A."
  },
  {
    "institutionCode": "322",
    "shortName": "CCR DE ABELARDO LUZ",
    "institutionName": "Cooperativa de Crédito Rural de Abelardo Luz - Sulcredi/Crediluz"
  },
  {
    "institutionCode": "323",
    "shortName": "MERCADO PAGO IP LTDA.",
    "institutionName": "MERCADO PAGO INSTITUIÇÃO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "324",
    "shortName": "CARTOS SCD S.A.",
    "institutionName": "CARTOS SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "326",
    "shortName": "MEUTUDO SCFI",
    "institutionName": "MEUTUDO S.A - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "329",
    "shortName": "QI SCD S.A.",
    "institutionName": "QI Sociedade de Crédito Direto S.A."
  },
  {
    "institutionCode": "330",
    "shortName": "BANCO BARI S.A.",
    "institutionName": "BANCO BARI DE INVESTIMENTOS E FINANCIAMENTOS S.A."
  },
  {
    "institutionCode": "331",
    "shortName": "OSLO CAPITAL DTVM SA",
    "institutionName": "OSLO CAPITAL DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A"
  },
  {
    "institutionCode": "332",
    "shortName": "ACESSO SOLUÇÕES DE PAGAMENTO S.A. - INSTITUIÇÃO DE PAGAMENTO",
    "institutionName": "ACESSO SOLUÇÕES DE PAGAMENTO S.A. - INSTITUIÇÃO DE PAGAMENTO"
  },
  {
    "institutionCode": "334",
    "shortName": "BANCO BESA S.A.",
    "institutionName": "BANCO BESA S.A."
  },
  {
    "institutionCode": "335",
    "shortName": "BANCO DIGIO",
    "institutionName": "Banco Digio S.A."
  },
  {
    "institutionCode": "336",
    "shortName": "BCO C6 S.A.",
    "institutionName": "Banco C6 S.A."
  },
  {
    "institutionCode": "341",
    "shortName": "ITAÚ UNIBANCO S.A.",
    "institutionName": "ITAÚ UNIBANCO S.A."
  },
  {
    "institutionCode": "342",
    "shortName": "CREDITAS SCD",
    "institutionName": "Creditas Sociedade de Crédito Direto S.A."
  },
  {
    "institutionCode": "348",
    "shortName": "BCO XP S.A.",
    "institutionName": "Banco XP S.A."
  },
  {
    "institutionCode": "349",
    "shortName": "AL5 S.A. SCFI",
    "institutionName": "AL5 S.A. SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "350",
    "shortName": "COOPERATIVA DE CRÉDITO POPULAR DO BRASIL",
    "institutionName": "COOPERATIVA DE CRÉDITO POPULAR DO BRASIL - CREHNOR"
  },
  {
    "institutionCode": "352",
    "shortName": "SANTANDER CTVM S.A.",
    "institutionName": "SANTANDER CORRETORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "355",
    "shortName": "ÓTIMO SCD S.A.",
    "institutionName": "ÓTIMO SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "358",
    "shortName": "MIDWAY S.A. - SCFI",
    "institutionName": "MIDWAY S.A. - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "359",
    "shortName": "ZEMA CFI S/A",
    "institutionName": "ZEMA CRÉDITO, FINANCIAMENTO E INVESTIMENTO S/A"
  },
  {
    "institutionCode": "360",
    "shortName": "TRINUS CAPITAL DTVM",
    "institutionName": "TRINUS CAPITAL DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "362",
    "shortName": "CIELO IP S.A.",
    "institutionName": "CIELO S.A. - INSTITUIÇÃO DE PAGAMENTO"
  },
  {
    "institutionCode": "363",
    "shortName": "QI CTVM S.A.",
    "institutionName": "QI CORRETORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "364",
    "shortName": "EFÍ S.A. - IP",
    "institutionName": "EFÍ S.A. - INSTITUIÇÃO DE PAGAMENTO"
  },
  {
    "institutionCode": "365",
    "shortName": "SIMPAUL",
    "institutionName": "SIMPAUL CORRETORA DE CAMBIO E VALORES MOBILIARIOS  S.A."
  },
  {
    "institutionCode": "366",
    "shortName": "BCO SOCIETE GENERALE BRASIL",
    "institutionName": "BANCO SOCIETE GENERALE BRASIL S.A."
  },
  {
    "institutionCode": "368",
    "shortName": "BCO CSF S.A.",
    "institutionName": "Banco CSF S.A."
  },
  {
    "institutionCode": "370",
    "shortName": "BCO MIZUHO S.A.",
    "institutionName": "Banco Mizuho do Brasil S.A."
  },
  {
    "institutionCode": "373",
    "shortName": "UP.P SEP S.A.",
    "institutionName": "UP.P SOCIEDADE DE EMPRÉSTIMO ENTRE PESSOAS S.A."
  },
  {
    "institutionCode": "374",
    "shortName": "REALIZE SCFI S.A.",
    "institutionName": "REALIZE SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO S.A."
  },
  {
    "institutionCode": "376",
    "shortName": "BCO J.P. MORGAN S.A.",
    "institutionName": "BANCO J.P. MORGAN S.A."
  },
  {
    "institutionCode": "377",
    "shortName": "BMS SCD S.A.",
    "institutionName": "BMS SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "378",
    "shortName": "BCO BRASILEIRO DE CRÉDITO S.A.",
    "institutionName": "BANCO BRASILEIRO DE CRÉDITO SOCIEDADE ANÔNIMA"
  },
  {
    "institutionCode": "379",
    "shortName": "COOP COOPERFORTE LTDA.",
    "institutionName": "COOPERFORTE COOPERATIVA DE CRÉDITO E INVESTIMENTOS LTDA"
  },
  {
    "institutionCode": "380",
    "shortName": "PICPAY",
    "institutionName": "PICPAY INSTITUIçãO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "381",
    "shortName": "BCO MERCEDES-BENZ S.A.",
    "institutionName": "BANCO MERCEDES-BENZ DO BRASIL S.A."
  },
  {
    "institutionCode": "382",
    "shortName": "FIDUCIA SCMEPP LTDA",
    "institutionName": "FIDÚCIA SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E À EMPRESA DE PEQUENO PORTE LIMITADA."
  },
  {
    "institutionCode": "383",
    "shortName": "EBANX IP LTDA.",
    "institutionName": "EBANX INSTITUICAO DE PAGAMENTOS LTDA."
  },
  {
    "institutionCode": "384",
    "shortName": "GLOBAL SCM LTDA",
    "institutionName": "GLOBAL FINANÇAS SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E À EMPRESA DE PEQUENO PORTE LTDA."
  },
  {
    "institutionCode": "385",
    "shortName": "CECM DOS TRAB.PORT. DA G.VITOR",
    "institutionName": "COOPERATIVA DE ECONOMIA E CREDITO MUTUO DOS TRABALHADORES PORTUARIOS DA GRANDE VITORIA - CREDESTIVA."
  },
  {
    "institutionCode": "386",
    "shortName": "NU FINANCEIRA S.A. CFI",
    "institutionName": "NU FINANCEIRA S.A. - Sociedade de Crédito, Financiamento e Investimento"
  },
  {
    "institutionCode": "387",
    "shortName": "BCO TOYOTA DO BRASIL S.A.",
    "institutionName": "Banco Toyota do Brasil S.A."
  },
  {
    "institutionCode": "389",
    "shortName": "BCO MERCANTIL DO BRASIL S.A.",
    "institutionName": "Banco Mercantil do Brasil S.A."
  },
  {
    "institutionCode": "390",
    "shortName": "BCO GM S.A.",
    "institutionName": "BANCO GM S.A."
  },
  {
    "institutionCode": "391",
    "shortName": "CCR DE IBIAM",
    "institutionName": "COOPERATIVA DE CREDITO RURAL DE IBIAM - SULCREDI/IBIAM"
  },
  {
    "institutionCode": "393",
    "shortName": "BCO VOLKSWAGEN S.A",
    "institutionName": "Banco Volkswagen S.A."
  },
  {
    "institutionCode": "394",
    "shortName": "BCO BRADESCO FINANC. S.A.",
    "institutionName": "Banco Bradesco Financiamentos S.A."
  },
  {
    "institutionCode": "395",
    "shortName": "F D GOLD DTVM LTDA",
    "institutionName": "F.D'GOLD - DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA."
  },
  {
    "institutionCode": "396",
    "shortName": "MAGALUPAY",
    "institutionName": "MAGALUPAY INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "397",
    "shortName": "LISTO SCD S.A.",
    "institutionName": "LISTO SOCIEDADE DE CREDITO DIRETO S.A."
  },
  {
    "institutionCode": "398",
    "shortName": "IDEAL CTVM S.A.",
    "institutionName": "IDEAL CORRETORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "399",
    "shortName": "Kirton Bank",
    "institutionName": "Kirton Bank S.A. - Banco Múltiplo"
  },
  {
    "institutionCode": "400",
    "shortName": "COOP CREDITAG - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "COOPERATIVA DE CRÉDITO, POUPANÇA E SERVIÇOS FINANCEIROS - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "401",
    "shortName": "IUGU IP S.A.",
    "institutionName": "IUGU INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "402",
    "shortName": "COBUCCIO S.A. SCFI",
    "institutionName": "COBUCCIO S/A - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTOS"
  },
  {
    "institutionCode": "403",
    "shortName": "CORA SCFI",
    "institutionName": "CORA SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO S.A."
  },
  {
    "institutionCode": "404",
    "shortName": "SUMUP SCFI S.A",
    "institutionName": "SUMUP SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO S.A."
  },
  {
    "institutionCode": "406",
    "shortName": "ACCREDITO SCD S.A.",
    "institutionName": "ACCREDITO - SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "407",
    "shortName": "SEFER INVESTIMENTOS DTVM LTDA - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "SEFER INVESTIMENTOS DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "408",
    "shortName": "BONUSPAGO SCD S.A.",
    "institutionName": "BONUSPAGO SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "410",
    "shortName": "PLANNER SOCIEDADE DE CRÉDITO DIRETO",
    "institutionName": "PLANNER SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "411",
    "shortName": "VIA CERTA FINANCIADORA S.A. - CFI",
    "institutionName": "Via Certa Financiadora S.A. - Crédito, Financiamento e Investimentos"
  },
  {
    "institutionCode": "412",
    "shortName": "SOCIAL BANK S/A",
    "institutionName": "SOCIAL BANK BANCO MÚLTIPLO S/A"
  },
  {
    "institutionCode": "413",
    "shortName": "BCO BV S.A.",
    "institutionName": "BANCO BV S.A."
  },
  {
    "institutionCode": "414",
    "shortName": "LEND SCD S.A.",
    "institutionName": "LEND SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "415",
    "shortName": "BCO NACIONAL",
    "institutionName": "BANCO NACIONAL S.A."
  },
  {
    "institutionCode": "416",
    "shortName": "LAMARA SCD S.A.",
    "institutionName": "LAMARA SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "418",
    "shortName": "ZIPDIN SCD S.A.",
    "institutionName": "ZIPDIN SOLUÇÕES DIGITAIS SOCIEDADE DE CRÉDITO DIRETO S/A"
  },
  {
    "institutionCode": "419",
    "shortName": "NUMBRS SCD S.A.",
    "institutionName": "NUMBRS SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "421",
    "shortName": "CC LAR CREDI",
    "institutionName": "LAR COOPERATIVA DE CRÉDITO - LAR CREDI"
  },
  {
    "institutionCode": "422",
    "shortName": "BCO SAFRA S.A.",
    "institutionName": "Banco Safra S.A."
  },
  {
    "institutionCode": "423",
    "shortName": "COLUNA S.A. DTVM",
    "institutionName": "COLUNA S/A DISTRIBUIDORA DE TITULOS E VALORES MOBILIÁRIOS"
  },
  {
    "institutionCode": "425",
    "shortName": "SOCINAL S.A. CFI",
    "institutionName": "SOCINAL S.A. - CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "426",
    "shortName": "NEON FINANCEIRA - SCFI S.A.",
    "institutionName": "NEON FINANCEIRA - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO S.A"
  },
  {
    "institutionCode": "427",
    "shortName": "CRED.UFES",
    "institutionName": "COOPERATIVA DE CRÉDITO DOS SERVIDORES DA UNIVERSIDADE FEDERAL DO ESPIRITO SANTO"
  },
  {
    "institutionCode": "428",
    "shortName": "CREDSYSTEM SCD S.A.",
    "institutionName": "CREDSYSTEM SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "430",
    "shortName": "CCR SEARA",
    "institutionName": "COOPERATIVA DE CREDITO RURAL SEARA - CREDISEARA"
  },
  {
    "institutionCode": "433",
    "shortName": "BR-CAPITAL DTVM S.A.",
    "institutionName": "BR-CAPITAL DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "435",
    "shortName": "DELFINANCE SCD S.A.",
    "institutionName": "DELFINANCE SOCIEDADE DE CREDITO DIRETO S.A."
  },
  {
    "institutionCode": "438",
    "shortName": "TRUSTEE DTVM LTDA. - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "TRUSTEE DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA. - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "439",
    "shortName": "ID CTVM",
    "institutionName": "ID CORRETORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "440",
    "shortName": "COOP CREDI&GENTE",
    "institutionName": "CREDI&GENTE - COOPERATIVA DE CRÉDITO E INVESTIMENTOS"
  },
  {
    "institutionCode": "443",
    "shortName": "OCTA SCD S.A. - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "OCTA SOCIEDADE DE CRÉDITO DIRETO S.A. - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "444",
    "shortName": "TRINUS SCD S.A.",
    "institutionName": "TRINUS SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "445",
    "shortName": "PLANTAE CFI",
    "institutionName": "PLANTAE S.A. - CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "447",
    "shortName": "MIRAE ASSET (BRASIL) CCTVM LTDA.",
    "institutionName": "MIRAE ASSET (BRASIL) CORRETORA DE CÂMBIO, TÍTULOS  E VALORES MOBILIÁRIOS LTDA."
  },
  {
    "institutionCode": "448",
    "shortName": "HEMERA DTVM LTDA.",
    "institutionName": "HEMERA DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA."
  },
  {
    "institutionCode": "449",
    "shortName": "DM",
    "institutionName": "DM SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "450",
    "shortName": "FITS IP",
    "institutionName": "FITS INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "451",
    "shortName": "J17 - SCD S/A",
    "institutionName": "J17 - SOCIEDADE DE CRÉDITO DIRETO S/A"
  },
  {
    "institutionCode": "452",
    "shortName": "CREDIFIT SCD S.A.",
    "institutionName": "CREDIFIT SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "454",
    "shortName": "MÉRITO DTVM LTDA.",
    "institutionName": "MÉRITO DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA."
  },
  {
    "institutionCode": "455",
    "shortName": "VIS DTVM LTDA",
    "institutionName": "VIS DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA"
  },
  {
    "institutionCode": "456",
    "shortName": "BCO MUFG BRASIL S.A.",
    "institutionName": "Banco MUFG Brasil S.A."
  },
  {
    "institutionCode": "457",
    "shortName": "UY3 SCD S/A",
    "institutionName": "UY3 SOCIEDADE DE CRÉDITO DIRETO S/A"
  },
  {
    "institutionCode": "458",
    "shortName": "HEDGE INVESTMENTS DTVM LTDA.",
    "institutionName": "HEDGE INVESTMENTS DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA."
  },
  {
    "institutionCode": "460",
    "shortName": "UNAVANTI SCD S/A",
    "institutionName": "UNAVANTI SOCIEDADE DE CRÉDITO DIRETO S/A"
  },
  {
    "institutionCode": "461",
    "shortName": "ASAAS IP S.A.",
    "institutionName": "ASAAS GESTÃO FINANCEIRA INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "462",
    "shortName": "STARK SCD S.A.",
    "institutionName": "STARK SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "463",
    "shortName": "AZUMI DTVM",
    "institutionName": "AZUMI DISTRIBUIDORA DE TíTULOS E VALORES MOBILIáRIOS LTDA."
  },
  {
    "institutionCode": "464",
    "shortName": "BCO SUMITOMO MITSUI BRASIL S.A.",
    "institutionName": "Banco Sumitomo Mitsui Brasileiro S.A."
  },
  {
    "institutionCode": "465",
    "shortName": "CAPITAL CONSIG SCD S.A.",
    "institutionName": "CAPITAL CONSIG SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "467",
    "shortName": "MASTER S/A CCTVM - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "MASTER S/A CORRETORA DE CÂMBIO, TÍTULOS E VALORES MOBILIÁRIOS - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "468",
    "shortName": "PORTOSEG S.A. CFI",
    "institutionName": "PORTOSEG S.A. - CREDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "469",
    "shortName": "PICPAY INVEST",
    "institutionName": "PICPAY INVEST DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA"
  },
  {
    "institutionCode": "470",
    "shortName": "CDC SCD S.A.",
    "institutionName": "CDC SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "473",
    "shortName": "BCO CAIXA GERAL BRASIL S.A.",
    "institutionName": "Banco Caixa Geral - Brasil S.A."
  },
  {
    "institutionCode": "475",
    "shortName": "BCO YAMAHA MOTOR S.A.",
    "institutionName": "Banco Yamaha Motor do Brasil S.A."
  },
  {
    "institutionCode": "476",
    "shortName": "IDEA MAKER IP LTDA",
    "institutionName": "IDEA MAKER INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "477",
    "shortName": "CITIBANK N.A.",
    "institutionName": "Citibank N.A."
  },
  {
    "institutionCode": "478",
    "shortName": "GAZINCRED S.A. SCFI",
    "institutionName": "GAZINCRED S.A. SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "479",
    "shortName": "BCO ITAUBANK S.A.",
    "institutionName": "Banco ItauBank S.A."
  },
  {
    "institutionCode": "481",
    "shortName": "SUPERLÓGICA SCD S.A.",
    "institutionName": "SUPERLÓGICA SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "482",
    "shortName": "ARTTA SCD",
    "institutionName": "ARTTA SOCIEDADE DE CRÉDITO DIRETO S.A"
  },
  {
    "institutionCode": "484",
    "shortName": "APEX DTVM",
    "institutionName": "APEX DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "487",
    "shortName": "DEUTSCHE BANK S.A.BCO ALEMAO",
    "institutionName": "DEUTSCHE BANK S.A. - BANCO ALEMAO"
  },
  {
    "institutionCode": "488",
    "shortName": "JPMORGAN CHASE BANK",
    "institutionName": "JPMorgan Chase Bank, National Association"
  },
  {
    "institutionCode": "495",
    "shortName": "BCO LA PROVINCIA B AIRES BCE",
    "institutionName": "Banco de La Provincia de Buenos Aires"
  },
  {
    "institutionCode": "496",
    "shortName": "BBVA BRASIL BI S.A.",
    "institutionName": "BBVA BRASIL BANCO DE INVESTIMENTO S.A."
  },
  {
    "institutionCode": "505",
    "shortName": "BCO UBS BRASIL",
    "institutionName": "BANCO UBS (BRASIL) S.A."
  },
  {
    "institutionCode": "506",
    "shortName": "RJI",
    "institutionName": "RJI CORRETORA DE TITULOS E VALORES MOBILIARIOS LTDA"
  },
  {
    "institutionCode": "507",
    "shortName": "SCFI EFÍ S.A.",
    "institutionName": "SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO EFÍ S.A."
  },
  {
    "institutionCode": "508",
    "shortName": "AVENUE SECURITIES BI S.A.",
    "institutionName": "AVENUE SECURITIES BANCO DE INVESTIMENTO S.A."
  },
  {
    "institutionCode": "509",
    "shortName": "CELCOIN IP S.A.",
    "institutionName": "CELCOIN INSTITUICAO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "510",
    "shortName": "FFCRED SCD S.A.",
    "institutionName": "FFCRED SOCIEDADE DE CRÉDITO DIRETO S.A.."
  },
  {
    "institutionCode": "511",
    "shortName": "MAGNUM SCD",
    "institutionName": "MAGNUM SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "512",
    "shortName": "FINVEST DTVM",
    "institutionName": "FINVEST DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA."
  },
  {
    "institutionCode": "513",
    "shortName": "ATF SCD S.A.",
    "institutionName": "ATF SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "514",
    "shortName": "EXIM SCC",
    "institutionName": "EXIM SOCIEDADE CORRETORA DE CÂMBIO LTDA"
  },
  {
    "institutionCode": "516",
    "shortName": "QISTA S.A. CFI",
    "institutionName": "QISTA S.A. - CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "517",
    "shortName": "PAGUEVELOZ IP LTDA.",
    "institutionName": "PAGUEVELOZ INSTITUIÇÃO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "518",
    "shortName": "MERCADO CRÉDITO SCFI S.A.",
    "institutionName": "MERCADO CRÉDITO SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO S.A."
  },
  {
    "institutionCode": "519",
    "shortName": "LIONS TRUST DTVM",
    "institutionName": "LIONS TRUST DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA."
  },
  {
    "institutionCode": "520",
    "shortName": "SOMAPAY SCD S.A.",
    "institutionName": "SOMAPAY SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "521",
    "shortName": "PEAK SEP S.A.",
    "institutionName": "PEAK SOCIEDADE DE EMPRÉSTIMO ENTRE PESSOAS S.A."
  },
  {
    "institutionCode": "522",
    "shortName": "RED SCD S.A.",
    "institutionName": "RED SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "523",
    "shortName": "HR DIGITAL SCD",
    "institutionName": "HR DIGITAL - SOCIEDADE DE CRÉDITO DIRETO S/A"
  },
  {
    "institutionCode": "524",
    "shortName": "WNT CAPITAL DTVM",
    "institutionName": "WNT CAPITAL DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "525",
    "shortName": "INTERCAM CC LTDA",
    "institutionName": "INTERCAM CORRETORA DE CÂMBIO LTDA."
  },
  {
    "institutionCode": "526",
    "shortName": "MONETARIE SCD",
    "institutionName": "MONETARIE SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "527",
    "shortName": "ATICCA SCD S.A.",
    "institutionName": "ATICCA - SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "528",
    "shortName": "CBSF DTVM -EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "CBSF DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A.- EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "529",
    "shortName": "PINBANK IP",
    "institutionName": "PINBANK BRASIL INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "530",
    "shortName": "SER FINANCE SCD S.A.",
    "institutionName": "SER FINANCE SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "531",
    "shortName": "BMP SCD S.A.",
    "institutionName": "BMP SOCIEDADE DE CRÉDITO DIRETO S.A"
  },
  {
    "institutionCode": "532",
    "shortName": "FUTURO SCD",
    "institutionName": "FUTURO SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "533",
    "shortName": "SRM BANK",
    "institutionName": "SRM BANK INSTITUIÇÃO DE PAGAMENTO S/A"
  },
  {
    "institutionCode": "534",
    "shortName": "EWALLY IP S.A.",
    "institutionName": "EWALLY INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "535",
    "shortName": "OPEA SCD",
    "institutionName": "OPEA SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "536",
    "shortName": "NEON PAGAMENTOS S.A. IP",
    "institutionName": "NEON PAGAMENTOS S.A. - INSTITUIÇÃO DE PAGAMENTO"
  },
  {
    "institutionCode": "537",
    "shortName": "SELECT CREDIT SCMEPP LTDA.",
    "institutionName": "SELECT CREDIT SOCIEDADE DE CRÉDITO AO MICROEMPREENDEDOR E À EMPRESA DE PEQUENO PORTE LTDA."
  },
  {
    "institutionCode": "538",
    "shortName": "SUDACRED SCD S.A.",
    "institutionName": "SUDACRED SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "539",
    "shortName": "SANTINVEST S.A. - CFI",
    "institutionName": "SANTINVEST S.A. - CREDITO, FINANCIAMENTO E INVESTIMENTOS"
  },
  {
    "institutionCode": "540",
    "shortName": "HBI SCD",
    "institutionName": "HBI SOCIEDADE DE CRÉDITO DIRETO S/A."
  },
  {
    "institutionCode": "541",
    "shortName": "FDO GARANTIDOR CRÉDITOS",
    "institutionName": "FUNDO GARANTIDOR DE CREDITOS - FGC"
  },
  {
    "institutionCode": "542",
    "shortName": "CLOUDWALK IP LTDA",
    "institutionName": "CLOUDWALK INSTITUIÇÃO DE PAGAMENTO E SERVICOS LTDA"
  },
  {
    "institutionCode": "543",
    "shortName": "COOPCRECE",
    "institutionName": "COOPERATIVA DE ECONOMIA E CRÉDITO MÚTUO DOS ELETRICITÁRIOS E DOS TRABALHADORES DAS EMPRESAS DO SETOR DE ENERGIA - COOPCRECE"
  },
  {
    "institutionCode": "544",
    "shortName": "MULTICRED SCD S.A.",
    "institutionName": "MULTICRED SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "546",
    "shortName": "OKTO IP",
    "institutionName": "OKTO INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "547",
    "shortName": "BNK DIGITAL SCD S.A.",
    "institutionName": "BNK DIGITAL SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "548",
    "shortName": "RPW S.A. SCFI",
    "institutionName": "RPW S/A SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "550",
    "shortName": "BEETELLER IP LTDA.",
    "institutionName": "BEETELLER INSTITUIÇÃO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "551",
    "shortName": "VERT DTVM LTDA.",
    "institutionName": "VERT DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA"
  },
  {
    "institutionCode": "552",
    "shortName": "UZZIPAY IP S.A.",
    "institutionName": "UZZIPAY INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "553",
    "shortName": "PERCAPITAL SCD S.A.",
    "institutionName": "PERCAPITAL SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "554",
    "shortName": "BCO STONEX S.A.",
    "institutionName": "BANCO STONEX S.A."
  },
  {
    "institutionCode": "555",
    "shortName": "PAN FINAN",
    "institutionName": "PAN FINANCEIRA S.A. - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTOS"
  },
  {
    "institutionCode": "556",
    "shortName": "SAYGO CÂMBIO",
    "institutionName": "SAYGO CORRETORA DE CÂMBIO S.A."
  },
  {
    "institutionCode": "557",
    "shortName": "PAGPRIME IP",
    "institutionName": "PAGPRIME INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "559",
    "shortName": "KANASTRA CFI",
    "institutionName": "KANASTRA FINANCEIRA S.A, CREDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "560",
    "shortName": "MAG IP LTDA.",
    "institutionName": "MAG INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "561",
    "shortName": "PAY4FUN IP S.A.",
    "institutionName": "PAY4FUN INSTITUICAO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "562",
    "shortName": "AZIMUT BRASIL DTVM LTDA",
    "institutionName": "AZIMUT BRASIL DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA"
  },
  {
    "institutionCode": "563",
    "shortName": "PROTEGE CASH",
    "institutionName": "PROTEGE CASH INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "564",
    "shortName": "ANKOR CFI S.A.",
    "institutionName": "ANKOR CAPITAL - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO S/A"
  },
  {
    "institutionCode": "565",
    "shortName": "ÁGORA CTVM S.A.",
    "institutionName": "ÁGORA CORRETORA DE TITULOS E VALORES MOBILIARIOS S.A."
  },
  {
    "institutionCode": "566",
    "shortName": "FLAGSHIP IP LTDA",
    "institutionName": "FLAGSHIP INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "567",
    "shortName": "MERCANTIL FINANCEIRA",
    "institutionName": "MERCANTIL FINANCEIRA S.A. - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO."
  },
  {
    "institutionCode": "568",
    "shortName": "BRCONDOS SCD S.A.",
    "institutionName": "BRCONDOS SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "569",
    "shortName": "CONTA PRONTA IP",
    "institutionName": "CONTA PRONTA INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "571",
    "shortName": "MONTE BRAVO CTVM S.A.",
    "institutionName": "MONTE BRAVO CORRETORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "572",
    "shortName": "ALL IN CRED SCD S.A.",
    "institutionName": "ALL IN CRED SOCIEDADE DE CREDITO DIRETO S.A."
  },
  {
    "institutionCode": "573",
    "shortName": "OXY CH",
    "institutionName": "OXY COMPANHIA HIPOTECÁRIA"
  },
  {
    "institutionCode": "574",
    "shortName": "A55 SCD S.A.",
    "institutionName": "A55 SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "575",
    "shortName": "DGBK CREDIT S.A. - SOCIEDADE DE CRÉDITO DIRETO.",
    "institutionName": "DGBK CREDIT S.A. - SOCIEDADE DE CRÉDITO DIRETO."
  },
  {
    "institutionCode": "576",
    "shortName": "MERCADO BITCOIN IP LTDA",
    "institutionName": "MERCADO BITCOIN INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "577",
    "shortName": "AF DESENVOLVE SP S.A.",
    "institutionName": "DESENVOLVE SP - AGÊNCIA DE FOMENTO DO ESTADO DE SÃO PAULO S.A."
  },
  {
    "institutionCode": "579",
    "shortName": "QUADRA SCD",
    "institutionName": "QUADRA SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "585",
    "shortName": "SETHI SCD SA",
    "institutionName": "SETHI SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "586",
    "shortName": "Z1 IP LTDA.",
    "institutionName": "Z1 INSTITUIÇÃO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "587",
    "shortName": "FIDD DTVM LTDA.",
    "institutionName": "FIDD DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA."
  },
  {
    "institutionCode": "588",
    "shortName": "AVANCARD PROVER IP LTDA",
    "institutionName": "AVANCARD PROVER INSTITUIÇÃO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "589",
    "shortName": "G5 SCD SA",
    "institutionName": "G5 SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "590",
    "shortName": "REPASSES FINANCEIROS E SOLUCOES TECNOLOGICAS IP S.A.",
    "institutionName": "REPASSES FINANCEIROS E SOLUCOES TECNOLOGICAS INSTITUICAO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "591",
    "shortName": "BANVOX DTVM - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "BANVOX DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "592",
    "shortName": "MAPS IP LTDA.",
    "institutionName": "INSTITUIÇÃO DE PAGAMENTOS MAPS LTDA."
  },
  {
    "institutionCode": "593",
    "shortName": "TRANSFEERA IP S.A.",
    "institutionName": "TRANSFEERA INSTITUIÇÃO DE PAGAMENTO S.A"
  },
  {
    "institutionCode": "594",
    "shortName": "ASA SCFI S.A.",
    "institutionName": "ASA SOCIEDADE DE CRÉDITO FINANCIAMENTO E INVESTIMENTO S.A."
  },
  {
    "institutionCode": "595",
    "shortName": "IFOOD PAGO IP",
    "institutionName": "IFOOD PAGO INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "596",
    "shortName": "CACTVS IP S.A.",
    "institutionName": "CACTVS INSTITUICAO DE PAGAMENTO S.A"
  },
  {
    "institutionCode": "597",
    "shortName": "ISSUER IP LTDA.",
    "institutionName": "ISSUER INSTITUICAO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "598",
    "shortName": "KONECT SCD S/A",
    "institutionName": "KONECT SOCIEDADE DE CRÉDITO DIRETO S/A"
  },
  {
    "institutionCode": "599",
    "shortName": "AGORACRED S/A SCFI",
    "institutionName": "AGORACRED S/A SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "600",
    "shortName": "BCO LUSO BRASILEIRO S.A.",
    "institutionName": "Banco Luso Brasileiro S.A."
  },
  {
    "institutionCode": "604",
    "shortName": "BCO INDUSTRIAL DO BRASIL S.A.",
    "institutionName": "Banco Industrial do Brasil S.A."
  },
  {
    "institutionCode": "610",
    "shortName": "BCO VR S.A.",
    "institutionName": "Banco VR S.A."
  },
  {
    "institutionCode": "611",
    "shortName": "BCO PAULISTA S.A.",
    "institutionName": "Banco Paulista S.A."
  },
  {
    "institutionCode": "612",
    "shortName": "BCO GUANABARA S.A.",
    "institutionName": "Banco Guanabara S.A."
  },
  {
    "institutionCode": "613",
    "shortName": "OMNI BANCO S.A.",
    "institutionName": "Omni Banco S.A."
  },
  {
    "institutionCode": "614",
    "shortName": "SANTS SCD S.A.",
    "institutionName": "SANTS SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "615",
    "shortName": "SMART SOLUTIONS GROUP IP LTDA",
    "institutionName": "SMART SOLUTIONS GROUP INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "619",
    "shortName": "TRIO IP LTDA.",
    "institutionName": "TRIO INSTITUICAO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "620",
    "shortName": "REVOLUT SCD S.A.",
    "institutionName": "REVOLUT SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "623",
    "shortName": "BANCO PAN",
    "institutionName": "Banco Pan S.A."
  },
  {
    "institutionCode": "626",
    "shortName": "BCO C6 CONSIG",
    "institutionName": "BANCO C6 CONSIGNADO S.A."
  },
  {
    "institutionCode": "630",
    "shortName": "BANCO LETSBANK S.A. - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "BANCO LETSBANK S.A. - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "632",
    "shortName": "Z-ON SCD S.A.",
    "institutionName": "Z-ON SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "633",
    "shortName": "BCO RENDIMENTO S.A.",
    "institutionName": "Banco Rendimento S.A."
  },
  {
    "institutionCode": "634",
    "shortName": "BCO TRIANGULO S.A.",
    "institutionName": "BANCO TRIANGULO S.A."
  },
  {
    "institutionCode": "636",
    "shortName": "GIRO - SCD S/A",
    "institutionName": "GIRO - SOCIEDADE DE CRÉDITO DIRETO S/A"
  },
  {
    "institutionCode": "637",
    "shortName": "BCO SOFISA S.A.",
    "institutionName": "BANCO SOFISA S.A."
  },
  {
    "institutionCode": "643",
    "shortName": "BCO PINE S.A.",
    "institutionName": "Banco Pine S.A."
  },
  {
    "institutionCode": "644",
    "shortName": "321 SCD S.A.",
    "institutionName": "321 SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "646",
    "shortName": "DM SCFI",
    "institutionName": "DM SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO S.A"
  },
  {
    "institutionCode": "651",
    "shortName": "PAGARE IP S.A.",
    "institutionName": "PAGARE INSTITUICAO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "653",
    "shortName": "BM PLENO S.A. - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "BANCO PLENO S.A. - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "654",
    "shortName": "BCO DIGIMAIS S.A.",
    "institutionName": "BANCO DIGIMAIS S.A."
  },
  {
    "institutionCode": "655",
    "shortName": "BCO VOTORANTIM S.A.",
    "institutionName": "Banco Votorantim S.A."
  },
  {
    "institutionCode": "659",
    "shortName": "ONEKEY PAYMENTS IP S.A.",
    "institutionName": "ONEKEY PAYMENTS INSTITUICAO DE PAGAMENTO SA"
  },
  {
    "institutionCode": "660",
    "shortName": "PAGME IP LTDA",
    "institutionName": "PAGME INSTITUIÇÃO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "661",
    "shortName": "FREEX SCC S.A.",
    "institutionName": "FREEX SOCIEDADE CORRETORA DE CÂMBIO S.A."
  },
  {
    "institutionCode": "662",
    "shortName": "WE PAY OUT IP LTDA.",
    "institutionName": "WE PAY OUT INSTITUICAO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "663",
    "shortName": "ACTUAL DTVM S.A.",
    "institutionName": "ACTUAL DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS S.A."
  },
  {
    "institutionCode": "665",
    "shortName": "STARK BANK S.A. - IP",
    "institutionName": "STARK BANK S.A. - INSTITUICAO DE PAGAMENTO"
  },
  {
    "institutionCode": "668",
    "shortName": "CELCOIN SCD",
    "institutionName": "CELCOIN SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "669",
    "shortName": "TRANSFERO IP LTDA.",
    "institutionName": "TRANSFERO INSTITUICAO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "670",
    "shortName": "BSN",
    "institutionName": "BSN PAGAMENTOS INSTITUIÇÃO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "671",
    "shortName": "ZERO IP",
    "institutionName": "ZERO INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "672",
    "shortName": "STONE CFI S.A.",
    "institutionName": "STONE SOCIEDADE DE CREDITO, FINANCIAMENTO E INVESTIMENTO S.A."
  },
  {
    "institutionCode": "673",
    "shortName": "CCR DO AGRESTE ALAGOANO",
    "institutionName": "COOPERATIVA DE CRÉDITO RURAL DO AGRESTE ALAGOANO - COOPERAGRE"
  },
  {
    "institutionCode": "674",
    "shortName": "HINOVA PAY IP S.A.",
    "institutionName": "HINOVA PAY INSTITUICAO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "675",
    "shortName": "CASAS BAHIA PAY IP LTDA.",
    "institutionName": "CASAS BAHIA PAY INSTITUIÇÃO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "676",
    "shortName": "DUFRIO CFI S.A.",
    "institutionName": "DUFRIO FINANCEIRA, CRÉDITO, FINANCIAMENTO E INVESTIMENTOS S.A."
  },
  {
    "institutionCode": "677",
    "shortName": "GOWD IP LTDA.",
    "institutionName": "GOWD INSTITUIÇÃO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "678",
    "shortName": "FIDEM SCD S/A",
    "institutionName": "FIDEM SOCIEDADE DE CRÉDITO DIRETO S/A"
  },
  {
    "institutionCode": "679",
    "shortName": "PAY IP S.A.",
    "institutionName": "PAY INSTITUICAO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "680",
    "shortName": "DELTA GLOBAL SCD S.A.",
    "institutionName": "DELTA GLOBAL SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "681",
    "shortName": "MT IP S.A.",
    "institutionName": "MT INSTITUICAO DE PAGAMENTO SA"
  },
  {
    "institutionCode": "682",
    "shortName": "MONERY IP S.A.",
    "institutionName": "MONERY INSTITUICAO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "683",
    "shortName": "BRASIL CASH IP S.A.",
    "institutionName": "BRASIL CASH INSTITUICAO DE PAGAMENTO S.A"
  },
  {
    "institutionCode": "684",
    "shortName": "HARMOS S.A. - SCFI",
    "institutionName": "HARMOS S.A. - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "685",
    "shortName": "TYCOON TECHNOLOGY IIP S.A",
    "institutionName": "TYCOON TECHNOLOGY INSTITUICAO DE PAGAMENTO S.A"
  },
  {
    "institutionCode": "686",
    "shortName": "BIZ IP LTDA.",
    "institutionName": "BIZ INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "687",
    "shortName": "INCO SEP S.A.",
    "institutionName": "INCO SOCIEDADE DE EMPRÉSTIMO ENTRE PESSOAS S.A."
  },
  {
    "institutionCode": "688",
    "shortName": "KIKAI SCD S.A.",
    "institutionName": "KIKAI SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "690",
    "shortName": "BK IP S.A.",
    "institutionName": "BK INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "691",
    "shortName": "WASU IP LTDA.",
    "institutionName": "WASU - WALLET SUPPORT INSTITUIÇÃO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "692",
    "shortName": "SQUID SCD S.A.",
    "institutionName": "SQUID SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "693",
    "shortName": "EFEX IP",
    "institutionName": "EFEX INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "694",
    "shortName": "WOOVI IP LTDA.",
    "institutionName": "WOOVI INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "695",
    "shortName": "BEES IP LTDA.",
    "institutionName": "BEES INSTITUICAO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "696",
    "shortName": "LOAN BRASIL SCD S.A.",
    "institutionName": "LOAN BRASIL SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "697",
    "shortName": "JM CORRETORA DE CÂMBIO",
    "institutionName": "JM CORRETORA DE CÂMBIO LTDA."
  },
  {
    "institutionCode": "698",
    "shortName": "BIT SCD S.A.",
    "institutionName": "BIT SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "699",
    "shortName": "BFC SCD S.A.",
    "institutionName": "BFC SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "700",
    "shortName": "MW IP LTDA.",
    "institutionName": "MW INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "701",
    "shortName": "INTEGRAÇÃO DE CRÉDITO E COBRANÇA SCD",
    "institutionName": "INTEGRAÇÃO DE CRÉDITO E COBRANÇA SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "703",
    "shortName": "GETNET IP",
    "institutionName": "GETNET ADQUIRÊNCIA E SERVIÇOS PARA MEIOS DE PAGAMENTO S.A. INSTITUIÇÃO DE PAGAMENTO"
  },
  {
    "institutionCode": "704",
    "shortName": "FESTOR IP LTDA.",
    "institutionName": "FESTOR INSTITUIÇÃO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "707",
    "shortName": "BCO DAYCOVAL S.A",
    "institutionName": "Banco Daycoval S.A."
  },
  {
    "institutionCode": "708",
    "shortName": "BCO INDUSCRED DE INVESTIM. S/A",
    "institutionName": "BANCO INDUSCRED DE INVESTIMENTO S.A."
  },
  {
    "institutionCode": "712",
    "shortName": "OURIBANK S.A.",
    "institutionName": "OURIBANK S.A. BANCO MÚLTIPLO"
  },
  {
    "institutionCode": "714",
    "shortName": "FINAMAX S.A. CFI",
    "institutionName": "FINAMAX S.A. - CREDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "719",
    "shortName": "BANCO MASTER MÚLTIPLO - EM LIQUIDAÇÃO EXTRAJUDICIAL",
    "institutionName": "BANCO MASTER MÚLTIPLO S.A. - EM LIQUIDAÇÃO EXTRAJUDICIAL"
  },
  {
    "institutionCode": "741",
    "shortName": "BCO RIBEIRAO PRETO S.A.",
    "institutionName": "BANCO RIBEIRAO PRETO S.A."
  },
  {
    "institutionCode": "743",
    "shortName": "BANCO SEMEAR",
    "institutionName": "Banco Semear S.A."
  },
  {
    "institutionCode": "745",
    "shortName": "BCO CITIBANK S.A.",
    "institutionName": "Banco Citibank S.A."
  },
  {
    "institutionCode": "747",
    "shortName": "BCO RABOBANK INTL BRASIL S.A.",
    "institutionName": "Banco Rabobank International Brasil S.A."
  },
  {
    "institutionCode": "748",
    "shortName": "BANCO COOPERATIVO SICREDI",
    "institutionName": "BANCO COOPERATIVO SICREDI S.A."
  },
  {
    "institutionCode": "751",
    "shortName": "Scotiabank Brasil",
    "institutionName": "Scotiabank Brasil S.A. Banco Múltiplo"
  },
  {
    "institutionCode": "752",
    "shortName": "BCO BNP PARIBAS BRASIL S A",
    "institutionName": "Banco BNP Paribas Brasil S.A."
  },
  {
    "institutionCode": "753",
    "shortName": "NOVO BCO CONTINENTAL S.A. - BM",
    "institutionName": "Novo Banco Continental S.A. - Banco Múltiplo"
  },
  {
    "institutionCode": "754",
    "shortName": "BANCO SISTEMA",
    "institutionName": "Banco Sistema S.A."
  },
  {
    "institutionCode": "755",
    "shortName": "BOFA MERRILL LYNCH BM S.A.",
    "institutionName": "Bank of America Merrill Lynch Banco Múltiplo S.A."
  },
  {
    "institutionCode": "756",
    "shortName": "BANCO SICOOB S.A.",
    "institutionName": "BANCO COOPERATIVO SICOOB S.A. - BANCO SICOOB"
  },
  {
    "institutionCode": "757",
    "shortName": "BCO KEB HANA DO BRASIL S.A.",
    "institutionName": "BANCO KEB HANA DO BRASIL S.A."
  },
  {
    "institutionCode": "759",
    "shortName": "BANSUR JM SCD S.A.",
    "institutionName": "BANSUR JM SOCIEDADE DE CRÉDITO DIRETO S/A"
  },
  {
    "institutionCode": "760",
    "shortName": "EMCASH SERV FINANC SEP S.A.",
    "institutionName": "EMCASH SERVIÇOS FINANCEIROS SOCIEDADE DE EMPRÉSTIMO ENTRE PESSOAS S.A."
  },
  {
    "institutionCode": "761",
    "shortName": "URBANO S.A. SCFI",
    "institutionName": "URBANO S.A. - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "763",
    "shortName": "VUE IP S.A.",
    "institutionName": "VUE INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "764",
    "shortName": "INDEPENDÊNCIA CC",
    "institutionName": "INDEPENDÊNCIA COOPERATIVA DE CRÉDITO E INVESTIMENTO - INDEPENDÊNCIA COOPERATIVA DE CRÉDITO"
  },
  {
    "institutionCode": "765",
    "shortName": "PAGSMILE IP LTDA.",
    "institutionName": "PAGSMILE INSTITUIÇÃO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "766",
    "shortName": "LB PAY IP LTDA",
    "institutionName": "LB PAY INSTITUIÇÃO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "767",
    "shortName": "QORE",
    "institutionName": "QORE DISTRIBUIDORA DE TITULOS E VALORES MOBILIÁRIOS LTDA"
  },
  {
    "institutionCode": "768",
    "shortName": "BECKER FINANCEIRA SA - CFI",
    "institutionName": "BECKER FINANCEIRA S.A. - CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "769",
    "shortName": "99PAY IP S.A.",
    "institutionName": "99PAY INSTITUICAO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "770",
    "shortName": "V3 IP S.A.",
    "institutionName": "V3 INSTITUICAO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "771",
    "shortName": "WX IP LTDA.",
    "institutionName": "WX INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "772",
    "shortName": "CC MECUNP",
    "institutionName": "COOPERATIVA DE CRÉDITO MÚTUO DOS EMPREGADOS DO CENTRO UNIVERSITÁRIO NEWTON PAIVA LTDA. - CREDIPAIVA"
  },
  {
    "institutionCode": "773",
    "shortName": "KIWIFY IP",
    "institutionName": "KIWIFY INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "774",
    "shortName": "MOVA SEP S.A.",
    "institutionName": "MOVA SOCIEDADE DE EMPRÉSTIMO ENTRE PESSOAS S.A."
  },
  {
    "institutionCode": "775",
    "shortName": "CONTAAZUL IP LTDA.",
    "institutionName": "CONTAAZUL INSTITUICAO DE PAGAMENTO LTDA."
  },
  {
    "institutionCode": "778",
    "shortName": "PB SCD",
    "institutionName": "PB SOCIEDADE DE CREDITO DIRETO S.A."
  },
  {
    "institutionCode": "780",
    "shortName": "SAFETYPAY BRASIL IP LTDA",
    "institutionName": "SAFETYPAY BRASIL INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "781",
    "shortName": "BARU DTVM LTDA.",
    "institutionName": "BARU DISTRIBUIDORA DE TÍTULOS E VALORES MOBILIÁRIOS LTDA."
  },
  {
    "institutionCode": "783",
    "shortName": "SWAP IP S.A.",
    "institutionName": "SWAP INSTITUIÇÃO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "785",
    "shortName": "LA FINTECA IP LTDA",
    "institutionName": "LA FINTECA INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "786",
    "shortName": "AWX BRASIL IP LTDA.",
    "institutionName": "AWX BRASIL  INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "787",
    "shortName": "ATTRUS IP S/A",
    "institutionName": "ATTRUS INSTITUIÇÃO DE PAGAMENTO S/A"
  },
  {
    "institutionCode": "788",
    "shortName": "PROTOTYPE IP S.A.",
    "institutionName": "PROTOTYPE INSTITUICAO DE PAGAMENTO S.A."
  },
  {
    "institutionCode": "789",
    "shortName": "APUSDIGITAL IP LTDA.",
    "institutionName": "APUSDIGITAL INSTITUICAO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "790",
    "shortName": "MAX IP",
    "institutionName": "MAX INSTITUIÇÃO DE PAGAMENTO LTDA"
  },
  {
    "institutionCode": "791",
    "shortName": "MULTIPLIKE FINANCEIRA S.A. SCFI",
    "institutionName": "MULTIPLIKE FINANCEIRA S.A. SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO"
  },
  {
    "institutionCode": "792",
    "shortName": "NIXFIN SCD",
    "institutionName": "NIXFIN SOCIEDADE DE CRÉDITO DIRETO S.A."
  },
  {
    "institutionCode": "793",
    "shortName": "MAGALUPAY SCFI S.A.",
    "institutionName": "MAGALUPAY - SOCIEDADE DE CRÉDITO, FINANCIAMENTO E INVESTIMENTO S.A."
  },
  {
    "institutionCode": "794",
    "shortName": "ATUAL CC LTDA",
    "institutionName": "ATUAL SOCIEDADE CORRETORA DE CÂMBIO LTDA"
  },
  {
    "institutionCode": "795",
    "shortName": "BANCO TRATON BRASIL S.A.",
    "institutionName": "BANCO TRATON BRASIL S.A."
  },
  {
    "institutionCode": "804",
    "shortName": "MÊNTORE IP S.A.",
    "institutionName": "MÊNTORE INSTITUIÇÃO DE PAGAMENTO S.A."
  }
] as const;

