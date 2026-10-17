"use client";

export async function storePortalToken(token: string) {
  sessionStorage.setItem('sa_token', token);
}

export async function clearPortalToken() {
  sessionStorage.removeItem('sa_token');
}

export async function readPortalToken() {
  return sessionStorage.getItem('sa_token');
}
