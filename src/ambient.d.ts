type Validation = [errorCondition: boolean, errorMessage: string]

type SubmitError = string | null
type SubmitData = {
  event: SubmitEvent
  error: SubmitError
}
