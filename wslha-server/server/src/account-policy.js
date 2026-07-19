const PASSWORD_MIN_LENGTH = 6;

function validPassword(value) {
  return String(value || '').length >= PASSWORD_MIN_LENGTH;
}

module.exports = { PASSWORD_MIN_LENGTH, validPassword };
