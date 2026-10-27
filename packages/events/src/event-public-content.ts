export function presentPublicEventContent<T extends {
  coverImage?: unknown;
}>(event: T) {
  const { coverImage, ...rest } = event;

  return {
    ...rest,
    hasCoverImage: Boolean(coverImage)
  };
}

export function publicEventCoverWhere(eventId: string) {
  return {
    eventId,
    event: {
      id: eventId,
      isPublic: true,
      deletedAt: null
    }
  };
}
