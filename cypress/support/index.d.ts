declare namespace Cypress {
  interface Chainable<_Subject = any> {
    loadSignupPage(): Chainable<any>
    signedInSession(
      role: 'admin' | 'instructor' | 'reviewer' | 'student',
      options?: {
        email?: string
        initialPage?: string
      },
    ): Chainable<any>
    signOutViaUi(): Chainable<any>
    fillInput(selector: string, text: string): Chainable<any>
    selectOption(selector: string, text: string): Chainable<any>
    parseCopiedEmails(clipboardText: string): Chainable<string[]>
    getLatestOobLink(
      email: string,
      requestType:
        | 'VERIFY_EMAIL'
        | 'PASSWORD_RESET'
        | 'VERIFY_AND_CHANGE_EMAIL',
    ): Chainable<string>
    waitForNotification(text: string, timeoutMs?: number): Chainable<any>
    getFirebaseAuthToken(): Chainable<string>
    getFirestoreUserId(authToken: string, email: string): Chainable<string>
    getFirestoreDoc(
      authToken: string,
      collection: string,
      docId: string,
    ): Chainable<any>
    setFirestoreDoc(
      authToken: string,
      collection: string,
      docId: string,
      data: any,
    ): Chainable<any>
  }
}
