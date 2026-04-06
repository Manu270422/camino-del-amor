// Mercado Pago devuelve parámetros en la URL cuando falla el pago.
// Los leemos y mostramos un detalle técnico discreto para el usuario.
// Documentación MP: https://www.mercadopago.com.co/developers/es/docs/checkout-pro/checkout-customization/user-interface/redirection

(function () {
  const params        = new URLSearchParams(window.location.search);
  const status        = params.get('status');          // 'failure' | 'pending'
  const statusDetail  = params.get('status_detail');   // ej: 'cc_rejected_insufficient_amount'
  const paymentId     = params.get('payment_id');

  // Limpiar sessionStorage si había una sesión pendiente
  sessionStorage.removeItem('cda_session');

  // Mostrar detalle solo si hay info útil
  const detailEl = document.getElementById('error-detail');

  if (status === 'pending') {
    // Pago pendiente (PSE, efectivo) — no es un error real
    detailEl.textContent = 'Estado: pago pendiente de acreditación. '
      + 'Te avisaremos cuando se confirme.';
  } else if (statusDetail) {
    // Traducciones de los códigos más comunes de MP
    const mensajes = {
      cc_rejected_insufficient_amount: 'Fondos insuficientes en la tarjeta.',
      cc_rejected_bad_filled_security_code: 'Código de seguridad incorrecto.',
      cc_rejected_bad_filled_date:     'Fecha de vencimiento incorrecta.',
      cc_rejected_bad_filled_other:    'Datos de la tarjeta incorrectos.',
      cc_rejected_call_for_authorize:  'El banco requiere autorización previa.',
      cc_rejected_card_disabled:       'La tarjeta está deshabilitada.',
      cc_rejected_duplicated_payment:  'Pago duplicado detectado.',
      cc_rejected_high_risk:           'Pago rechazado por medidas de seguridad.',
    };
    
    const msg = mensajes[statusDetail] || `Código: ${statusDetail}`;
    detailEl.textContent = msg + (paymentId ? `  ·  Ref: ${paymentId}` : '');
  }
})();