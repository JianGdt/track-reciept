export const emailAndPasswordPolicy = {
  enabled: true,
  minPasswordLength: 8,
  requireEmailVerification: true,
  autoSignIn: false,
};
export const emailVerificationPolicy = {
  sendOnSignUp: true,
  sendOnSignIn: false,
  autoSignInAfterVerification: false,
  expiresIn: 3600,
};
