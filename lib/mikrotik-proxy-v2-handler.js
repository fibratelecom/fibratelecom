const https = require('node:https');
const crypto = require('node:crypto');

// RouterOS 7 aceita TLS 1.2 no serviço www-ssl. O runtime atual da Vercel usa
// OpenSSL moderno; alguns equipamentos/firmwares encerram o ClientHello antes
// mesmo da autenticação. Esta ponte limita somente esta função a TLS 1.2 e
// habilita compatibilidade de negociação sem desativar a validação do certificado.
const originalRequest = https.request;
if (!https.__provedorPlusRouterOsCompat) {
  https.request = function routerOsCompatibleRequest(options, ...args) {
    if (options && typeof options === 'object') {
      options = {
        ...options,
        minVersion: 'TLSv1.2',
        maxVersion: 'TLSv1.2',
        secureOptions:
          (Number(options.secureOptions) || 0) |
          (crypto.constants.SSL_OP_LEGACY_SERVER_CONNECT || 0),
      };
    }
    return originalRequest.call(https, options, ...args);
  };
  Object.defineProperty(https, '__provedorPlusRouterOsCompat', { value: true });
}

const handler = require('./mikrotik-proxy');

module.exports = async function mikrotikProxyV2(req, res) {
  const originalEnd = res.end.bind(res);
  res.end = function endWithFriendlyTlsError(chunk, ...args) {
    try {
      const raw = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk || '');
      const parsed = raw ? JSON.parse(raw) : null;
      const error = String(parsed?.error || '');
      if (!parsed?.ok && /EPROTO|handshake failure|SSL alert number 40|ssl3_read_bytes/i.test(error)) {
        const host = String(req?.body?.router?.host || '').replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
        parsed.error =
          `O endereço ${host || 'do MikroTik'} foi alcançado, mas o HTTPS do RouterOS recusou o handshake TLS. ` +
          'No MikroTik, o serviço www-ssl precisa estar habilitado na porta 443 e associado a um certificado TLS válido para o domínio do MikroTik Cloud. ' +
          'O Provedor Plus já está tentando TLS 1.2 compatível com RouterOS 7.';
        chunk = JSON.stringify(parsed);
        try { res.setHeader('Content-Length', Buffer.byteLength(chunk)); } catch {}
      }
    } catch {}
    return originalEnd(chunk, ...args);
  };
  return handler(req, res);
};
