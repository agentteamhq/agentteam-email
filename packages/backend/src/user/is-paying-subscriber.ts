type SubscriberLookup = {
  stripeSubscriptionId?: string | null
}

export function isPayingSubscriber(user: SubscriberLookup) {
  if (user.stripeSubscriptionId) {
    return true
  }
  return false
}
