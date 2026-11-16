/** Thrown when the data does not fit the requested or any version. */
export class QrCapacityError extends RangeError {
  override readonly name = 'QrCapacityError'
}
