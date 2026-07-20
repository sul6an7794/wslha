// عميل Authentica لإرسال/التحقق من رمز OTP عبر الجوال — يحل محل كلمة المرور بالكامل.
// راجع: https://api.authentica.sa (POST /api/v2/send-otp، POST /api/v2/verify-otp)
const BASE_URL = process.env.AUTHENTICA_BASE_URL || 'https://api.authentica.sa';

function apiKey() {
  const key = process.env.AUTHENTICA_API_KEY;
  if (!key) throw new Error('AUTHENTICA_API_KEY غير مضبوط في بيئة الخادم');
  return key;
}

function headers() {
  return { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Authorization': apiKey() };
}

function otpErrorMessage(status, data) {
  if (status === 401) return 'خطأ في إعدادات خدمة الرسائل — تواصل مع الدعم';
  if (status === 429) return 'محاولات كثيرة جدًا، حاول بعد قليل';
  if (status === 400) return (data && data.message) || 'رقم الجوال أو الرمز غير صحيح';
  return 'تعذّر إرسال/التحقق من الرمز حاليًا، حاول لاحقًا';
}

// fetchImpl قابل للحقن للاختبارات — بدون طلبات شبكة حقيقية.
async function sendOtp(phone, fetchImpl = fetch) {
  const res = await fetchImpl(BASE_URL + '/api/v2/send-otp', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ method: 'sms', phone }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw Object.assign(new Error(otpErrorMessage(res.status, data)), { status: res.status });
  }
  return data;
}

async function verifyOtp(phone, otp, fetchImpl = fetch) {
  const res = await fetchImpl(BASE_URL + '/api/v2/verify-otp', {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ phone, otp }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.verified) {
    throw Object.assign(new Error(otpErrorMessage(res.status, data)), { status: res.status });
  }
  return data;
}

module.exports = { sendOtp, verifyOtp, BASE_URL };
