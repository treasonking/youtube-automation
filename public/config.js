const host = window.location.hostname || '127.0.0.1';
const base = `http://${host}:3000/api`;

// 외부에서 window.ENV?.API_BASE 값을 넘기면 그 값을, 아니면 base 사용
export const API_BASE = (window.ENV && window.ENV.API_BASE) ? window.ENV.API_BASE : base;