export type StrictOmit<T, TKey extends keyof T> = Pick<T, Exclude<keyof T, TKey>> & {
  [P in TKey]?: never
}
