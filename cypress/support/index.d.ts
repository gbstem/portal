declare namespace Cypress {
  interface Chainable<_Subject = any> {
    signedInSession(role: string): Chainable<any>
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
  }
}
