declare module "@garmin/fitsdk" {
  export class Stream {
    static fromArrayBuffer(buffer: ArrayBuffer): Stream;
  }
  export class Decoder {
    constructor(stream: Stream);
    isFIT(): boolean;
    checkIntegrity(): boolean;
    read(): {
      messages: {
        sessionMesgs?: import("./fit").Session[];
        monitoringMesgs?: unknown[];
      };
      errors: unknown[];
    };
  }
}
