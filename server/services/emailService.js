const { google } = require('googleapis');
const { getAuthenticatedClient, getAuthenticatedClientForEmail } = require('../config/gmail');
const { getDatabase } = require('../database/init');
const Tesseract = require('tesseract.js');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

// Lock para evitar processamento simultâneo do mesmo usuário
const processingLocks = new Map();

// Companhias aéreas conhecidas (pode ser expandido)
const AIRLINES = [
  'latam', 'tam', 'gol', 'azul', 'avianca', 'smiles',
  'american airlines', 'united', 'delta', 'lufthansa',
  'air france', 'british airways', 'emirates', 'qatar',
  'turkish airlines', 'air canada', 'aeromexico'
];

// Domínios de email de companhias aéreas (para identificação mais precisa)
const AIRLINE_DOMAINS = [
  'latam.com', 'info.latam.com', 'tam.com.br', 'gol.com.br',
  'azul.com.br', 'avianca.com', 'smiles.com.br', 'comunicado.smiles.com.br',
  'aa.com', 'united.com', 'delta.com', 'lufthansa.com',
  'airfrance.com', 'britishairways.com', 'emirates.com', 'qatar.com'
];

// Padrões contextuais (prioritários - aparecem próximos a palavras-chave)
// Usar \b para word boundaries e evitar capturar partes de palavras
const CONTEXTUAL_PATTERNS = [
  // Padrão para "Seu código de verificação é" seguido de número (pode estar em linha separada)
  /\b(?:seu\s+código\s+de\s+verificação\s+é|seu\s+code\s+of\s+verification\s+is)[:\s\n]*\b([A-Z0-9]{4,8})\b/gi,
  // Padrão para capturar número após "Seu código de verificação é" mesmo em tags diferentes
  /\bseu\s+código\s+de\s+verificação\s+é[^<]*<p[^>]*>\s*([A-Z0-9]{4,8})\s*<\/p>/gi,
  // Padrão para números em tags <p> após "código de verificação" no HTML
  /\b(?:código\s+de\s+verificação|código\s+de\s+acesso)[^<]*<p[^>]*>\s*([A-Z0-9]{4,8})\s*<\/p>/gi,
  // Padrão para "código de verificação" seguido de número (com word boundary)
  /\b(?:código|code|verification|verificação|confirmation|confirmação)\b[:\s\-]*\b([A-Z0-9]{4,8})\b/gi,
  /\b(?:seu\s+)?(?:código|code)\b\s+(?:é|is|de|of)\b[:\s\-]*\b([A-Z0-9]{4,8})\b/gi,
  /\b(?:código|code)\b\s+(?:de\s+)?(?:verificação|verification|acesso|access)\b[:\s\-]*\b([A-Z0-9]{4,8})\b/gi,
  /\b(?:código\s+de\s+acesso|code\s+of\s+access)\b[:\s\-]*\b([A-Z0-9]{4,8})\b/gi,
  /\b(?:seu\s+)?(?:código\s+de\s+acesso|code\s+of\s+access)\b[:\s\-]*\b([A-Z0-9]{4,8})\b/gi,
  /\b(?:aqui\s+está\s+seu\s+)?(?:código|code)\b[:\s\-]*\b([A-Z0-9]{4,8})\b/gi,
  // Padrão específico para LATAM: "Seu código de verificação é" seguido de código em <p> com estilo
  // Aceita espaços e quebras de linha dentro da tag, e atributos em qualquer ordem
  /(?:seu\s+código\s+de\s+verificação\s+é|your\s+verification\s+code\s+is)[\s\S]{0,500}?<p[^>]*(?:font-size[^>]*:\s*24px|font-weight[^>]*:\s*700)[^>]*(?:font-size[^>]*:\s*24px|font-weight[^>]*:\s*700)[^>]*>[\s\n]*([A-Z0-9]{4,8})[\s\n]*<\/p>/gi,
  // Padrão específico para Smiles: código em <td> com font-size:40px e font-weight:bold
  // O código está dentro de uma tabela com estilo específico
  // Aceita atributos em qualquer ordem e outros atributos também
  /<td[^>]*(?:font-size[^>]*:\s*40px|font-weight[^>]*:\s*bold)[^>]*(?:font-size[^>]*:\s*40px|font-weight[^>]*:\s*bold)[^>]*>[\s\n]*([A-Z0-9]{4,8})[\s\n]*<\/td>/gi,
  // Padrões em tags HTML específicas de código (incluindo <p> com estilo LATAM)
  // Mais flexível: aceita font-size: 24px e font-weight: 700 em qualquer ordem, com espaços/quebras
  /<p[^>]*(?:font-size[^>]*:\s*24px|font-weight[^>]*:\s*700)[^>]*(?:font-size[^>]*:\s*24px|font-weight[^>]*:\s*700)[^>]*>[\s\n]*([A-Z0-9]{4,8})[\s\n]*<\/p>/gi,
  /<div[^>]*class[^>]*code[^>]*>\s*([A-Z0-9]{4,8})\s*<\/div>/gi,
  /<span[^>]*class[^>]*code[^>]*>\s*([A-Z0-9]{4,8})\s*<\/span>/gi,
  // Padrões em caixas destacadas (geralmente códigos)
  /\[([A-Z0-9]{4,8})\]/g,
  /\(([A-Z0-9]{4,8})\)/g
];

// Padrões genéricos (menos prioritários - só se não encontrar contexto)
const GENERIC_PATTERNS = [
  // Padrões com font-size grande (códigos geralmente são destacados)
  /<[^>]*font-size[^>]*:\s*[2-9]\d+px[^>]*>([A-Z0-9]{4,8})<\/[^>]*>/gi,
  // Padrões em tags HTML com estilo destacado
  /<[^>]*style[^>]*font[^>]*>([A-Z0-9]{4,8})<\/[^>]*>/gi,
  // Padrão para tags <td> com font-size grande (Smiles usa isso)
  /<td[^>]*font-size[^>]*:\s*[3-9]\d+px[^>]*>[\s\n]*([A-Z0-9]{4,8})[\s\n]*<\/td>/gi,
  // Padrão para números em tags <p> ou <div> isolados (após remover HTML)
  /<p[^>]*>\s*([A-Z0-9]{4,8})\s*<\/p>/gi,
  /<div[^>]*>\s*([A-Z0-9]{4,8})\s*<\/div>/gi
];

// Assuntos válidos por companhia aérea (case-insensitive)
const VALID_SUBJECTS = {
  'latam': [
    'código de verificação',
    'codigo de verificacao',
    'verification code',
    'código de verificaçao'
  ],
  'smiles': [
    'aqui está seu código de acesso, não compartilhe.',
    'aqui está seu código de acesso, não compartilhe',
    'aqui esta seu codigo de acesso, nao compartilhe.',
    'aqui esta seu codigo de acesso, nao compartilhe',
    'aqui está seu código de acesso.',
    'aqui está seu código de acesso',
    'aqui esta seu codigo de acesso.',
    'aqui esta seu codigo de acesso',
    'seu código de acesso',
    'codigo de acesso',
    'código de acesso',
    'aqui está seu código',
    'aqui esta seu codigo',
    'código de acesso, não compartilhe.',
    'código de acesso, não compartilhe',
    'codigo de acesso, nao compartilhe.',
    'codigo de acesso, nao compartilhe'
  ],
  'tam': [
    'código de verificação',
    'codigo de verificacao',
    'verification code',
    'código de verificaçao'
  ],
  'gol': [
    'código de verificação',
    'codigo de verificacao',
    'verification code',
    'código de verificaçao'
  ]
};

// Palavras-chave de promoção que devem fazer o email ser ignorado
const PROMOTION_KEYWORDS = [
  'promoção', 'promocao', 'promotion', 'promo',
  'desconto', 'discount', 'off', '% off', 'porcentagem',
  'milhas', 'miles', 'bônus', 'bonus', 'pontos', 'points',
  'cupom', 'coupon', 'válido até', 'valido ate', 'expira',
  'só até', 'so ate', 'aproveite', 'aproveite já', 'aproveite ja',
  'últimas horas', 'ultimas horas', 'última chance', 'ultima chance',
  'crescer livre', 'crescer com limite', 'faltam horas',
  'oferta', 'offer', 'black friday', 'cyber monday', 'natal',
  'réveillon', 'reveillon', 'especial', 'imperdível', 'imperdivel',
  'grátis', 'gratis', 'free', 'ganhe', 'ganhe até', 'ganhe ate'
];

function isPromotionEmail(subject) {
  const subjectLower = subject.toLowerCase();
  // Se o assunto contém qualquer palavra-chave de promoção, é promoção
  return PROMOTION_KEYWORDS.some(keyword => subjectLower.includes(keyword));
}

function isAirlineEmail(from, subject) {
  const fromLower = from.toLowerCase();
  const subjectLower = subject.toLowerCase().trim();
  
  // PRIMEIRO: Se o assunto contém palavras de promoção, IGNORAR completamente
  if (isPromotionEmail(subject)) {
    return false;
  }
  
  // Verificar LATAM - APENAS se o assunto corresponder exatamente
  if (fromLower.includes('info.latam.com')) {
    // Processar APENAS se o assunto contém "código de verificação"
    // Normalizar o assunto removendo pontuação no final para comparação mais flexível
    const normalizedSubject = subjectLower.replace(/[.,;:!?]+$/g, '').trim();
    console.log(`[DEBUG] LATAM - Verificando assunto: "${subject}" (normalizado: "${normalizedSubject}")`);
    
    // Verificar se contém palavras-chave essenciais (mais permissivo, igual ao Smiles)
    // Aceita "código de verificação" ou "codigo de verificacao" (com ou sem acentos)
    const hasCodeVerification = normalizedSubject.includes('código de verificação') || 
                                normalizedSubject.includes('codigo de verificacao') ||
                                (normalizedSubject.includes('código') && normalizedSubject.includes('verificação')) ||
                                (normalizedSubject.includes('codigo') && normalizedSubject.includes('verificacao'));
    
    // Também verificar contra a lista de assuntos válidos (normalizando ambos)
    const hasValidSubject = hasCodeVerification || VALID_SUBJECTS.latam.some(validSubject => {
      const normalizedValid = validSubject.toLowerCase().replace(/[.,;:!?]+$/g, '').trim();
      // Verificar se o assunto normalizado contém o padrão válido (mais permissivo)
      const matches = normalizedSubject.includes(normalizedValid) || normalizedValid.includes(normalizedSubject);
      if (matches) {
        console.log(`[DEBUG] LATAM - Match encontrado: Assunto "${normalizedSubject}" corresponde a "${normalizedValid}"`);
      }
      return matches;
    });
    
    if (!hasValidSubject) {
      console.log(`[DEBUG] LATAM - REJEITADO: Assunto "${subject}" (normalizado: "${normalizedSubject}") não corresponde a nenhum padrão válido`);
      console.log(`[DEBUG] LATAM - Padrões válidos:`, VALID_SUBJECTS.latam);
      console.log(`[DEBUG] LATAM - Contém "código de verificação": ${normalizedSubject.includes('código de verificação')}`);
      console.log(`[DEBUG] LATAM - Contém "codigo de verificacao": ${normalizedSubject.includes('codigo de verificacao')}`);
    } else {
      console.log(`[DEBUG] LATAM - ACEITO: Assunto válido encontrado (contém "código de verificação")`);
    }
    
    // RETORNAR APENAS SE TEM ASSUNTO VÁLIDO (não processar outros)
    return hasValidSubject;
  }
  
  // Verificar Smiles - APENAS se o assunto corresponder exatamente
  if (fromLower.includes('comunicado.smiles.com.br')) {
    // Processar APENAS se o assunto contém "código de acesso"
    // Normalizar o assunto removendo pontuação no final para comparação mais flexível
    // Remover ponto, vírgula, dois pontos, ponto e vírgula, exclamação, interrogação
    const normalizedSubject = subjectLower.replace(/[.,;:!?]+$/g, '').trim();
    console.log(`[DEBUG] Smiles - Verificando assunto: "${subject}" (normalizado: "${normalizedSubject}")`);
    
    // Verificar se contém palavras-chave essenciais (mais permissivo)
    // Aceita "código de acesso" ou "codigo de acesso" (com ou sem acentos)
    const hasCodeAccess = normalizedSubject.includes('código de acesso') || 
                          normalizedSubject.includes('codigo de acesso') ||
                          (normalizedSubject.includes('código') && normalizedSubject.includes('acesso')) ||
                          (normalizedSubject.includes('codigo') && normalizedSubject.includes('acesso'));
    
    // Também verificar contra a lista de assuntos válidos (normalizando ambos)
    const hasValidSubject = hasCodeAccess || VALID_SUBJECTS.smiles.some(validSubject => {
      const normalizedValid = validSubject.toLowerCase().replace(/[.,;:!?]+$/g, '').trim();
      // Verificar se o assunto normalizado contém o padrão válido (mais permissivo)
      const matches = normalizedSubject.includes(normalizedValid) || normalizedValid.includes(normalizedSubject);
      if (matches) {
        console.log(`[DEBUG] Smiles - Match encontrado: Assunto "${normalizedSubject}" corresponde a "${normalizedValid}"`);
      }
      return matches;
    });
    
    if (!hasValidSubject) {
      console.log(`[DEBUG] Smiles - REJEITADO: Assunto "${subject}" (normalizado: "${normalizedSubject}") não corresponde a nenhum padrão válido`);
      console.log(`[DEBUG] Smiles - Padrões válidos:`, VALID_SUBJECTS.smiles);
      console.log(`[DEBUG] Smiles - Contém "código de acesso": ${normalizedSubject.includes('código de acesso')}`);
      console.log(`[DEBUG] Smiles - Contém "codigo de acesso": ${normalizedSubject.includes('codigo de acesso')}`);
    } else {
      console.log(`[DEBUG] Smiles - ACEITO: Assunto válido encontrado (contém "código de acesso")`);
    }
    // RETORNAR APENAS SE TEM ASSUNTO VÁLIDO (não processar outros)
    return hasValidSubject;
  }
  
  // APENAS Smiles e LATAM são processados - retornar false para todas as outras
  return false;
}

// Palavras comuns que não são códigos (definir ANTES de usar)
const NON_CODE_WORDS = new Set([
  'MUITO', 'ATEN', 'TEMPO', 'MAIS', 'MENOS', 'TANTO', 'QUANTO',
  'HOJE', 'AMANHA', 'ONTEM', 'AGORA', 'DEPOIS', 'ANTES',
  'AQUI', 'ALI', 'ONDE', 'QUANDO', 'COMO', 'PORQUE',
  'VERDE', 'AZUL', 'VERMELHO', 'AMARELO', 'PRETO', 'BRANCO',
  'GRANDE', 'PEQUENO', 'ALTO', 'BAIXO', 'LONGO', 'CURTO',
  // Companhias aéreas e termos relacionados
  'LATAM', 'LATA', 'TAM', 'GOL', 'AZUL', 'SMILES', 'AVIANCA',
  'TOKENS', 'TOKEN', 'SMS', 'EMAIL', 'MENSAGEM',
  // Outras palavras comuns (incluindo partes de palavras)
  'CÓDIGO', 'CODIGO', 'CODE', 'VERIFICAÇÃO', 'VERIFICACAO', 'VERIFICA',
  'ACESSO', 'ACCESS', 'CONFIRMAÇÃO', 'CONFIRMACAO', 'CONFIRMA',
  'VERIFICATION', 'CONFIRMATION', 'VERIFY', 'CONFIRM',
  // Palavras relacionadas a emails
  'GMAIL', 'COM', 'BR', 'ORG', 'NET', 'EDU',
  'PARA', 'FROM', 'REPLY', 'REPLYTO', 'REPLY-TO'
]);

function extractCodes(text) {
  const codes = new Set();
  
  if (!text || text.length === 0) {
    return [];
  }
  
  // Normalizar texto (remover HTML tags, espaços extras)
  const normalizedText = text
    .replace(/<[^>]+>/g, ' ') // Remover tags HTML
    .replace(/\s+/g, ' ') // Normalizar espaços
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  
  // Também criar uma versão que preserva quebras de linha para padrões específicos
  const textWithNewlines = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
  
  console.log(`[DEBUG] Extraindo códigos de texto (${text.length} chars, normalizado: ${normalizedText.length} chars)`);
  
  // Primeiro, buscar padrões contextuais (mais confiáveis)
  // Usar texto original (com HTML) para padrões que precisam de tags HTML
  CONTEXTUAL_PATTERNS.forEach((pattern, index) => {
    let match;
    // Para padrões que incluem tags HTML, usar texto original; caso contrário, usar normalizado ou com quebras
    let textToSearch;
    if (pattern.source.includes('<')) {
      textToSearch = text;
    } else if (pattern.source.includes('\\n')) {
      textToSearch = textWithNewlines;
    } else {
      textToSearch = normalizedText;
    }
    // Resetar lastIndex para garantir que o regex funcione corretamente
    pattern.lastIndex = 0;
    while ((match = pattern.exec(textToSearch)) !== null) {
      let code = match[1] || match[0];
      
      // Limpar o código - remover palavras comuns do início e fim
      code = code
        .replace(/^(código|code|verification|verificação|verifica|confirmation|confirmação|confirma|seu|é|is|de|of|acesso|access)[:\s\-]*/i, '')
        .replace(/[:\s\-]+$/, '')
        .trim();
      
      // Se após limpar ficou muito curto ou é palavra comum, pular
      if (code.length < 4) {
        continue;
      }
      
      // Validar código - verificar se não é palavra comum
      if (code && /^[A-Z0-9]{4,8}$/i.test(code)) {
        const codeUpper = code.toUpperCase();
        // Verificar se não é palavra comum ANTES de validar
        if (!NON_CODE_WORDS.has(codeUpper)) {
          if (isValidCode(code, normalizedText)) {
            console.log(`[DEBUG] Código encontrado (padrão ${index}): ${codeUpper}`);
            codes.add(codeUpper);
          } else {
            console.log(`[DEBUG] Código rejeitado pela validação: ${codeUpper}`);
          }
        } else {
          console.log(`[DEBUG] Código rejeitado (palavra comum): ${codeUpper}`);
        }
      }
      
      // Para padrões com múltiplos grupos
      if (match[2]) {
        const code2 = match[2].trim();
        if (code2 && /^[A-Z0-9]{4,8}$/i.test(code2)) {
          const code2Upper = code2.toUpperCase();
          // Verificar se não é palavra comum ANTES de validar
          if (!NON_CODE_WORDS.has(code2Upper) && isValidCode(code2, normalizedText)) {
            codes.add(code2Upper);
          }
        }
      }
    }
  });
  
  // Se não encontrou códigos contextuais, tentar padrões genéricos (mais restritivos)
  if (codes.size === 0) {
    console.log('[DEBUG] Nenhum código contextual encontrado, tentando padrões genéricos...');
    GENERIC_PATTERNS.forEach((pattern, index) => {
      let match;
      // Resetar lastIndex
      pattern.lastIndex = 0;
      // Usar texto original para padrões HTML
      const textToSearch = pattern.source.includes('<') ? text : normalizedText;
      while ((match = pattern.exec(textToSearch)) !== null) {
        let code = match[1] || match[0];
        code = code.trim();
        
        if (code && /^[A-Z0-9]{4,8}$/i.test(code)) {
          const codeUpper = code.toUpperCase();
          // Verificar se não é palavra comum ANTES de validar
          if (!NON_CODE_WORDS.has(codeUpper)) {
            if (isValidCode(code, normalizedText)) {
              console.log(`[DEBUG] Código encontrado (padrão genérico ${index}): ${codeUpper}`);
              codes.add(codeUpper);
            }
          }
        }
      }
    });
  }
  
  // Se ainda não encontrou, tentar padrão simples para números isolados (4-6 dígitos)
  // Mas apenas se estiver próximo a palavras-chave de código
  if (codes.size === 0) {
    console.log('[DEBUG] Tentando padrão simples para números isolados próximos a palavras-chave...');
    const simplePattern = /\b(\d{4,6})\b/g;
    let match;
    while ((match = simplePattern.exec(normalizedText)) !== null) {
      const code = match[1];
      const codeIndex = normalizedText.indexOf(code, match.index);
      
      // Verificar contexto antes e depois (100 caracteres)
      const before = normalizedText.substring(Math.max(0, codeIndex - 100), codeIndex).toLowerCase();
      const after = normalizedText.substring(codeIndex + code.length, Math.min(normalizedText.length, codeIndex + code.length + 100)).toLowerCase();
      const context = before + ' ' + after;
      
      // Verificar se está próximo a palavras-chave de código
      const codeKeywords = [
        'código', 'code', 'verificação', 'verification', 'acesso', 'access',
        'seu código', 'your code', 'código de verificação', 'verification code',
        'código de acesso', 'access code'
      ];
      
      const hasCodeContext = codeKeywords.some(keyword => context.includes(keyword));
      
      if (hasCodeContext) {
        const codeUpper = code.toUpperCase();
        if (!NON_CODE_WORDS.has(codeUpper) && isValidCode(code, normalizedText)) {
          console.log(`[DEBUG] Código encontrado (padrão simples com contexto): ${codeUpper}`);
          codes.add(codeUpper);
        }
      }
    }
  }
  
  console.log(`[DEBUG] Total de códigos extraídos: ${codes.size} (${Array.from(codes).join(', ')})`);
  return Array.from(codes);
}

// Função para validar se um código é realmente um código de verificação
function isValidCode(code, text) {
  const codeUpper = code.toUpperCase();
  
  // Filtrar palavras comuns que não são códigos
  if (NON_CODE_WORDS.has(codeUpper)) {
    console.log(`[DEBUG] isValidCode: ${codeUpper} rejeitado (palavra comum)`);
    return false;
  }
  
  // Verificar se o código está próximo a palavras de email/cabeçalho
  const textLower = text.toLowerCase();
  const codeIndex = textLower.indexOf(code.toLowerCase());
  if (codeIndex !== -1) {
    const before = textLower.substring(Math.max(0, codeIndex - 20), codeIndex);
    const after = textLower.substring(codeIndex + code.length, Math.min(textLower.length, codeIndex + code.length + 20));
    const surrounding = before + ' ' + after;
    
    // Palavras que indicam que está em um cabeçalho de email
    const emailHeaderWords = [
      'para:', 'to:', 'de:', 'from:', 'assunto:', 'subject:',
      'reply-to:', 'replyto:', 'responder para:', 'reply to:',
      'data:', 'date:', 'enviado por:', 'sent by:',
      '@', '.com', '.br', '.org', '.net', 'gmail', 'hotmail', 'yahoo'
    ];
    
    if (emailHeaderWords.some(word => surrounding.includes(word))) {
      console.log(`[DEBUG] isValidCode: ${codeUpper} rejeitado (próximo a cabeçalho de email)`);
      return false; // Está em um cabeçalho de email, não é código
    }
  }
  
  // Filtrar números muito comuns
  const commonNumbers = new Set([
    '1234', '0000', '1111', '9999', '2024', '2023', '2025', '2026',
    '1000', '2000', '3000', '4000', '5000', '6000', '7000', '8000', '9000'
  ]);
  if (commonNumbers.has(codeUpper)) {
    return false;
  }
  
  // Filtrar números muito grandes (mais de 6 dígitos são suspeitos - geralmente são valores, não códigos)
  if (/^\d{7,}$/.test(code)) {
    return false; // Números com 7+ dígitos são muito grandes para códigos de verificação
  }
  
  // Filtrar números que parecem ser valores monetários ou grandes quantidades
  if (/^\d{5,6}$/.test(code)) {
    const num = parseInt(code);
    // Códigos de 6 dígitos podem ir até 999999 (aceitar todos)
    // Apenas rejeitar números redondos grandes que são claramente valores
    // Números redondos grandes (ex: 10000, 20000, 50000, 100000, 200000) são suspeitos
    if (num >= 10000 && num % 1000 === 0) {
      return false;
    }
    // Números muito grandes de 6 dígitos que são redondos (ex: 100000, 200000, 500000)
    if (num >= 100000 && num % 10000 === 0) {
      return false;
    }
    // Aceitar todos os outros números de 5-6 dígitos como códigos válidos
  }
  
  // Filtrar números que parecem ser valores monetários (ex: R$ 100, 50% off)
  if (/^\d{4,6}$/.test(code)) {
    // Verificar se está próximo a palavras de promoção/desconto
    const context = text.toLowerCase();
    const codeIndex = context.indexOf(code);
    if (codeIndex !== -1) {
      const before = context.substring(Math.max(0, codeIndex - 50), codeIndex);
      const after = context.substring(codeIndex + code.length, Math.min(context.length, codeIndex + code.length + 50));
      const surrounding = before + ' ' + after;
      
      // Palavras que indicam que não é código de verificação
      const exclusionWords = [
        'desconto', 'discount', 'off', 'promoção', 'promotion', 'cupom', 'coupon',
        'r$', 'reais', 'real', 'dólar', 'dollar', 'us$', 'valor', 'value', 'preço', 'price',
        'milhas', 'miles', 'pontos', 'points', '%', 'porcentagem', 'percentage',
        'bônus', 'bonus',
        'mil', 'milh', 'milhões', 'milhoes', 'milhares'
      ];
      
      // Verificar palavras que podem ser falsos positivos se estiverem em contexto de código
      const conditionalExclusionWords = [
        { word: 'válido', validContexts: ['válido por', 'valido por', 'válido até', 'valido ate', 'código válido', 'codigo valido'] },
        { word: 'valid', validContexts: ['valid for', 'valid until', 'code valid'] },
        { word: 'expira', validContexts: ['expira em', 'expira em', 'código expira', 'codigo expira'] },
        { word: 'expires', validContexts: ['expires in', 'expires at', 'code expires'] },
        { word: 'até', validContexts: ['válido até', 'valido ate', 'código até', 'codigo ate'] },
        { word: 'until', validContexts: ['valid until', 'code until'] }
      ];
      
      // Verificar palavras de exclusão diretas
      const foundExclusionWord = exclusionWords.find(word => surrounding.includes(word));
      if (foundExclusionWord) {
        console.log(`[DEBUG] isValidCode: ${codeUpper} rejeitado (próximo a palavra de promoção: "${foundExclusionWord}")`);
        console.log(`[DEBUG] isValidCode: Contexto (50 chars antes/depois): "${surrounding.substring(0, 100)}"`);
        return false;
      }
      
      // Verificar palavras condicionais (só rejeitar se não estiver em contexto válido)
      for (const conditional of conditionalExclusionWords) {
        if (surrounding.includes(conditional.word)) {
          // Verificar se está em um contexto válido (sobre validade do código)
          const isInValidContext = conditional.validContexts.some(context => surrounding.includes(context));
          if (!isInValidContext) {
            console.log(`[DEBUG] isValidCode: ${codeUpper} rejeitado (próximo a "${conditional.word}" sem contexto válido)`);
            console.log(`[DEBUG] isValidCode: Contexto (50 chars antes/depois): "${surrounding.substring(0, 100)}"`);
            return false;
          } else {
            console.log(`[DEBUG] isValidCode: ${codeUpper} - "${conditional.word}" encontrado mas em contexto válido de código`);
          }
        }
      }
    }
  }
  
  // Filtrar números que são claramente datas (ex: 2024, 2025)
  if (/^20\d{2}$/.test(code)) {
    return false;
  }
  
  // Filtrar números que são claramente anos
  if (/^(19|20)\d{2}$/.test(code) && parseInt(code) >= 1900 && parseInt(code) <= 2100) {
    return false;
  }
  
  // Preferir códigos alfanuméricos ou números que não parecem valores
  // Códigos de verificação geralmente têm letras ou são números "aleatórios"
  if (/^\d+$/.test(code)) {
    // Se é só número, verificar se não parece ser um valor comum
    const num = parseInt(code);
    
    // Códigos de verificação numéricos geralmente têm 4-6 dígitos
    if (code.length < 4 || code.length > 6) {
      console.log(`[DEBUG] isValidCode: ${codeUpper} rejeitado (tamanho inválido: ${code.length} dígitos)`);
      return false;
    }
    
    // Verificar se todos os dígitos são iguais (ex: 1111, 2222, 999999)
    if (/^(\d)\1+$/.test(code)) {
      console.log(`[DEBUG] isValidCode: ${codeUpper} rejeitado (dígitos repetidos)`);
      return false;
    }
    
    // Aceitar todos os números de 4-6 dígitos que não sejam redondos
    // Códigos como 997271, 794945, 496684, 148035 são válidos
    console.log(`[DEBUG] isValidCode: ${codeUpper} APROVADO (número válido de ${code.length} dígitos)`);
  } else {
    console.log(`[DEBUG] isValidCode: ${codeUpper} APROVADO (código alfanumérico)`);
  }
  
  return true;
}

function identifyAirline(from, subject) {
  const text = `${from} ${subject}`.toLowerCase();
  
  // Verificar por nome da companhia primeiro
  for (const airline of AIRLINES) {
    if (text.includes(airline)) {
      return airline.toUpperCase();
    }
  }
  
  // Verificar por domínio de email
  for (const domain of AIRLINE_DOMAINS) {
    if (from.toLowerCase().includes(domain)) {
      // Extrair nome da companhia do domínio
      const domainParts = domain.split('.');
      const airlineName = domainParts[0];
      if (airlineName === 'info') {
        return 'LATAM';
      } else if (airlineName === 'comunicado') {
        return 'SMILES';
      }
      return airlineName.toUpperCase();
    }
  }
  
  return 'UNKNOWN';
}

// Função para extrair o nome do cliente do email
function extractCustomerName(bodyText, airline) {
  if (!bodyText) return null;
  
  const text = bodyText;
  
  // Padrões para LATAM: "Olá NOME," ou "Olá NOME."
  // Exemplo: "Olá LUANRAQUEL DE ARAUJO A,"
  if (airline === 'LATAM') {
    const latamPattern = /Olá\s+([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ][A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s]+?)[,\.]/i;
    const match = text.match(latamPattern);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  // Padrões para Smiles: "NOME, use esse código" ou similar
  if (airline === 'SMILES') {
    const smilesPattern = /<span[^>]*font-weight[^>]*700[^>]*>([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ][A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s]+?)<\/span>.*?use esse código/i;
    const match = text.match(smilesPattern);
    if (match && match[1]) {
      return match[1].trim();
    }
    // Tentar padrão mais simples: nome em negrito antes de "use esse código"
    const simplePattern = /([A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ][A-ZÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÃÕÇ\s]{3,50}?),\s*use esse código/i;
    const simpleMatch = text.match(simplePattern);
    if (simpleMatch && simpleMatch[1]) {
      return simpleMatch[1].trim();
    }
  }
  
  return null;
}

// Função para extrair códigos de imagens usando OCR
async function extractCodesFromImages(emailPayload, gmail, userId, messageId) {
  const codes = new Set();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'gmail-ocr-'));
  
  try {
    // Função recursiva para encontrar todas as partes de imagem
    function findImageParts(part, imageParts = []) {
      if (!part) return imageParts;
      
      // Verificar se é uma imagem
      if (part.mimeType && part.mimeType.startsWith('image/')) {
        imageParts.push(part);
      }
      
      // Verificar partes aninhadas
      if (part.parts) {
        part.parts.forEach(p => findImageParts(p, imageParts));
      }
      
      return imageParts;
    }
    
    const imageParts = findImageParts(emailPayload.payload);
    
    if (imageParts.length === 0) {
      return [];
    }
    
    console.log(`Encontradas ${imageParts.length} imagem(ns) no email ${messageId}`);
    
    // Processar cada imagem
    for (const imagePart of imageParts) {
      try {
        if (!imagePart.body || !imagePart.body.attachmentId) {
          continue;
        }
        
        // Baixar o anexo da imagem
        const attachment = await gmail.users.messages.attachments.get({
          userId: 'me',
          messageId: messageId,
          id: imagePart.body.attachmentId
        });
        
        if (!attachment.data.data) {
          continue;
        }
        
        // Decodificar a imagem
        const imageBuffer = Buffer.from(attachment.data.data, 'base64');
        const imagePath = path.join(tempDir, `image-${Date.now()}-${Math.random().toString(36).substring(7)}.${imagePart.mimeType.split('/')[1]}`);
        
        // Salvar temporariamente
        await fs.writeFile(imagePath, imageBuffer);
        
        // Usar OCR para extrair texto
        console.log(`Processando imagem com OCR: ${imagePath}`);
        const { data: { text } } = await Tesseract.recognize(imagePath, 'por+eng', {
          logger: m => {
            // Log apenas erros
            if (m.status === 'recognizing text' && m.progress === 1) {
              console.log(`OCR concluído para ${imagePath}`);
            }
          }
        });
        
        // Extrair códigos do texto OCR
        if (text) {
          const extractedCodes = extractCodes(text);
          extractedCodes.forEach(code => codes.add(code));
          console.log(`Códigos extraídos da imagem: ${extractedCodes.join(', ')}`);
        }
        
        // Remover arquivo temporário
        await fs.unlink(imagePath).catch(() => {});
        
      } catch (error) {
        console.error(`Erro ao processar imagem: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error(`Erro ao extrair códigos de imagens: ${error.message}`);
  } finally {
    // Limpar diretório temporário
    try {
      const files = await fs.readdir(tempDir);
      await Promise.all(files.map(file => fs.unlink(path.join(tempDir, file)).catch(() => {})));
      await fs.rmdir(tempDir).catch(() => {});
    } catch (e) {
      // Ignorar erros de limpeza
    }
  }
  
  return Array.from(codes);
}

async function fetchEmailsFromSpam(userId, maxResults = 100, afterDate = null) {
  try {
    // SEMPRE usar o email milhasplusred@gmail.com para buscar emails
    const auth = await getAuthenticatedClientForEmail('milhasplusred@gmail.com');
    const gmail = google.gmail({ version: 'v1', auth });

    // Buscar emails em TODAS as pastas (spam, inbox, etc.) e independente de leitura
    // APENAS Smiles e LATAM (mais rápido e focado)
    const mainDomains = [
      'info.latam.com',
      'comunicado.smiles.com.br'
    ];
    
    const airlineQuery = mainDomains.map(domain => `from:${domain}`).join(' OR ');
    
    // Query para buscar emails de companhias aéreas em qualquer pasta
    // Não filtrar por leitura - buscar todos (lidos e não lidos)
    let query = `(${airlineQuery})`;
    
    // Se fornecido uma data, buscar apenas emails mais recentes
    if (afterDate) {
      // Formato do Gmail: after:YYYY/MM/DD
      const date = afterDate instanceof Date ? afterDate : new Date(afterDate);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}/${month}/${day}`;
      query += ` after:${dateStr}`;
      console.log(`[DEBUG] Buscando emails após: ${dateStr} (${date.toISOString()})`);
    }
    
    let allMessages = [];
    let nextPageToken = null;
    let totalFetched = 0;
    
    // Buscar com paginação para pegar mais emails
    do {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: Math.min(100, maxResults - totalFetched), // Reduzido para processar menos dados
        pageToken: nextPageToken
      });

      const messages = response.data.messages || [];
      allMessages = allMessages.concat(messages);
      nextPageToken = response.data.nextPageToken;
      totalFetched += messages.length;
      
      // Limitar total de emails processados
      if (totalFetched >= maxResults) {
        break;
      }
    } while (nextPageToken && totalFetched < maxResults);

    const emails = [];

    console.log(`Buscando emails Smiles e LATAM: encontrados ${allMessages.length} emails para processar`);

    for (const message of allMessages) {
      try {
        const emailData = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full'
        });

        const headers = emailData.data.payload.headers;
        const from = headers.find(h => h.name === 'From')?.value || '';
        const to = headers.find(h => h.name === 'To')?.value || '';
        const subject = headers.find(h => h.name === 'Subject')?.value || '';
        const date = headers.find(h => h.name === 'Date')?.value || '';

        // Log apenas para Smiles e LATAM
        const isAirline = isAirlineEmail(from, subject);
        if (from.toLowerCase().includes('info.latam.com') || from.toLowerCase().includes('comunicado.smiles.com.br')) {
          console.log(`[DEBUG] Email encontrado: De: ${from}, Assunto: "${subject}", É válido: ${isAirline}`);
          if (!isAirline) {
            console.log(`[DEBUG]   -> REJEITADO: Assunto não corresponde aos padrões válidos`);
            console.log(`[DEBUG]   -> Assuntos válidos para ${from.toLowerCase().includes('smiles') ? 'Smiles' : 'LATAM'}:`, 
              from.toLowerCase().includes('smiles') ? VALID_SUBJECTS.smiles : VALID_SUBJECTS.latam);
          }
        }

        // Verificar se é email de companhia aérea
        if (isAirline) {
          // Extrair corpo do email (suporta HTML e texto)
          let bodyText = '';
          const parts = emailData.data.payload.parts || [];
          
          function extractBody(part) {
            if (part.mimeType === 'text/plain' || part.mimeType === 'text/html') {
              if (part.body && part.body.data) {
                try {
                  const decoded = Buffer.from(part.body.data, 'base64').toString('utf-8');
                  bodyText += decoded + ' ';
                } catch (e) {
                  console.error('Erro ao decodificar parte do email:', e.message);
                }
              }
            }
            if (part.parts) {
              part.parts.forEach(extractBody);
            }
          }

          if (emailData.data.payload.body && emailData.data.payload.body.data) {
            try {
              bodyText = Buffer.from(emailData.data.payload.body.data, 'base64').toString('utf-8');
            } catch (e) {
              console.error('Erro ao decodificar corpo do email:', e.message);
            }
          } else {
            parts.forEach(extractBody);
          }

          // Remover cabeçalhos de email do texto antes de extrair códigos
          // Isso evita que campos como "Para:", "De:", etc. sejam processados
          bodyText = bodyText
            .replace(/^(Para|To|De|From|Assunto|Subject|Data|Date):\s*[^\n]*\n?/gmi, '')
            .replace(/^(Reply-To|Responder para):\s*[^\n]*\n?/gmi, '')
            .replace(/^[A-Za-z-]+:\s*[^\n]*\n?/gm, ''); // Remover outros cabeçalhos

          // Extrair códigos apenas do corpo do email (sem cabeçalhos)
          console.log(`[DEBUG] Processando email ${message.id} - Tamanho do texto: ${bodyText.length} chars`);
          console.log(`[DEBUG] Primeiros 500 chars do texto: ${bodyText.substring(0, 500)}`);
          let codes = extractCodes(bodyText);
          console.log(`[DEBUG] Códigos extraídos do email ${message.id}: ${codes.length} códigos (${codes.join(', ')})`);
          
          // Sempre tentar extrair de imagens também (códigos podem estar em imagens)
          console.log('Tentando extrair códigos de imagens...');
          const imageCodes = await extractCodesFromImages(emailData.data, gmail, userId, message.id);
          if (imageCodes.length > 0) {
            console.log(`Códigos encontrados em imagens: ${imageCodes.join(', ')}`);
            // Combinar códigos do texto e das imagens
            const allCodes = new Set([...codes, ...imageCodes]);
            codes = Array.from(allCodes);
          }
          const airline = identifyAirline(from, subject);
          
          // Extrair nome do cliente
          const customerName = extractCustomerName(bodyText, airline);
          if (customerName) {
            console.log(`[DEBUG] Nome extraído: ${customerName}`);
          }

          console.log(`Email processado: ${airline} - Assunto: "${subject}" - Códigos encontrados: ${codes.length} (${codes.join(', ')})`);

          if (codes.length > 0) {
            emails.push({
              id: message.id,
              from,
              to,
              subject,
              date,
              airline,
              codes,
              customerName: customerName || null,
              bodyText: bodyText.substring(0, 500) // Limitar tamanho
            });
          }
        }
      } catch (error) {
        console.error(`Erro ao processar email ${message.id}:`, error.message);
      }
    }

    console.log(`Processamento concluído: ${emails.length} emails com códigos extraídos de ${allMessages.length} emails analisados`);
    return emails;
  } catch (error) {
    console.error('Erro ao buscar emails:', error);
    throw error;
  }
}

async function saveCodesToDatabase(userId, emails) {
  const db = getDatabase();
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      let saved = 0;
      let errors = 0;
      let duplicates = 0;
      let pending = 0;

      emails.forEach((email) => {
        // Remover códigos duplicados do mesmo email antes de salvar
        const uniqueCodes = [...new Set(email.codes)];
        
        uniqueCodes.forEach((code) => {
          pending++;
          
          // Primeiro verificar se já existe
          db.get(
            `SELECT id FROM verification_codes 
             WHERE user_id = ? AND email_id = ? AND code = ?`,
            [userId, email.id, code],
            (err, row) => {
              if (err) {
                console.error('Erro ao verificar código existente:', err);
                errors++;
                pending--;
                if (pending === 0) {
                  resolve({ saved, errors, duplicates, total: emails.length });
                }
                return;
              }
              
              // Se já existe, não inserir
              if (row) {
                duplicates++;
                pending--;
                if (pending === 0) {
                  resolve({ saved, errors, duplicates, total: emails.length });
                }
                return;
              }
              
              // Se não existe, inserir
              db.run(
                `INSERT INTO verification_codes 
                 (user_id, email_id, airline, code, email_subject, email_from, email_to, email_date, customer_name)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  userId,
                  email.id,
                  email.airline,
                  code,
                  email.subject,
                  email.from,
                  email.to,
                  email.date,
                  email.customerName || null
                ],
                function(insertErr) {
                  pending--;
                  if (insertErr) {
                    // Se for erro de constraint UNIQUE, tratar como duplicata
                    if (insertErr.message && insertErr.message.includes('UNIQUE constraint')) {
                      duplicates++;
                    } else {
                      console.error('Erro ao salvar código:', insertErr);
                      errors++;
                    }
                  } else if (this.changes > 0) {
                    saved++;
                  }
                  
                  // Resolver quando todas as inserções terminarem
                  if (pending === 0) {
                    resolve({ saved, errors, duplicates, total: emails.length });
                  }
                }
              );
            }
          );
        });
      });

      // Se não houver códigos para salvar
      if (pending === 0) {
        resolve({ saved: 0, errors: 0, duplicates: 0, total: emails.length });
      }
    });
  });
}

async function processEmails(userId, onlyNew = false) {
  // Verificar se já está processando para este usuário
  if (processingLocks.has(userId)) {
    console.log(`Processamento já em andamento para usuário ${userId}. Aguardando...`);
    return { emails: [], result: { saved: 0, errors: 0, duplicates: 0, total: 0 }, message: 'Processamento já em andamento' };
  }
  
  // Adicionar lock
  processingLocks.set(userId, true);
  
  try {
    console.log(`Processando emails para usuário ${userId}...`);
    
    // Se onlyNew = true, buscar apenas emails mais recentes que o último processado
    let afterDate = null;
    if (onlyNew) {
      const db = getDatabase();
      const lastEmail = await new Promise((resolve, reject) => {
        db.get(
          `SELECT MAX(COALESCE(email_date, extracted_at)) as last_date 
           FROM verification_codes 
           WHERE user_id = ?`,
          [userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      if (lastEmail && lastEmail.last_date) {
        // Adicionar 1 segundo ao último email para evitar processar o mesmo email
        const lastDate = new Date(lastEmail.last_date);
        lastDate.setSeconds(lastDate.getSeconds() + 1);
        afterDate = lastDate;
        console.log(`[DEBUG] Buscando apenas emails após: ${afterDate.toISOString()}`);
      }
    }
    
    const emails = await fetchEmailsFromSpam(userId, 100, afterDate);
    console.log(`Encontrados ${emails.length} emails com códigos${onlyNew ? ' (apenas novos)' : ''}`);
    
    if (emails.length > 0) {
      // Log detalhado dos emails antes de salvar
      emails.forEach(email => {
        console.log(`[DEBUG] Email a ser salvo: ${email.airline} - ${email.codes.length} código(s): ${email.codes.join(', ')}`);
      });
      
      const result = await saveCodesToDatabase(userId, emails);
      console.log(`Salvos ${result.saved} códigos no banco de dados${result.duplicates > 0 ? `, ${result.duplicates} duplicatas ignoradas` : ''}`);
      
      // Log detalhado do resultado
      if (result.saved > 0) {
        console.log(`[DEBUG] Códigos salvos por companhia:`, emails.reduce((acc, email) => {
          acc[email.airline] = (acc[email.airline] || 0) + email.codes.length;
          return acc;
        }, {}));
      }
      
      // Notificar via WebSocket sobre novos códigos
      if (result.saved > 0) {
        const { broadcastNewCode } = require('../websocket/websocket');
        emails.forEach(email => {
          email.codes.forEach(code => {
            // Buscar código salvo para notificar
            const db = getDatabase();
            db.get(
              `SELECT vc.*, u.username 
               FROM verification_codes vc
               LEFT JOIN users u ON vc.user_id = u.id
               WHERE vc.user_id = ? AND vc.email_id = ? AND vc.code = ?
               ORDER BY vc.extracted_at DESC LIMIT 1`,
              [userId, email.id, code],
              (err, savedCode) => {
                if (!err && savedCode) {
                  broadcastNewCode(savedCode);
                }
              }
            );
          });
        });
      }
      
      return { emails, result };
    }
    
    return { emails: [], result: { saved: 0, errors: 0, duplicates: 0, total: 0 } };
  } catch (error) {
    console.error('Erro ao processar emails:', error);
    throw error;
  } finally {
    // Remover lock após processamento
    processingLocks.delete(userId);
  }
}

module.exports = {
  fetchEmailsFromSpam,
  extractCodes,
  isAirlineEmail,
  identifyAirline,
  saveCodesToDatabase,
  processEmails
};

