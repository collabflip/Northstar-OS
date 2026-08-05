/** MockCalendarProvider — in-memory calendar, truthful mock status. */
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  attendees?: string[];
}

export class MockCalendarProvider {
  readonly name = "mock-calendar";
  readonly statusNote = "MOCK calendar — events stored locally only, no external sync.";
  private events: CalendarEvent[] = [];
  private seq = 1;

  async listBusy(fromIso: string, toIso: string): Promise<{ start: string; end: string }[]> {
    const from = +new Date(fromIso);
    const to = +new Date(toIso);
    return this.events
      .filter((e) => +new Date(e.start) < to && +new Date(e.end) > from)
      .map((e) => ({ start: e.start, end: e.end }));
  }

  async createEvent(e: Omit<CalendarEvent, "id">): Promise<CalendarEvent> {
    const event = { ...e, id: `mcal_${this.seq++}` };
    this.events.push(event);
    return event;
  }
}
