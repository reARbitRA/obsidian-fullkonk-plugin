/**
 * @jest-environment node
 */
import { Logger } from "../utils/logger";

describe("Logger", () => {
  let debugSpy: jest.SpyInstance;
  let infoSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    debugSpy = jest.spyOn(console, "debug").mockImplementation(() => {});
    infoSpy = jest.spyOn(console, "info").mockImplementation(() => {});
    warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("defaults to 'warn' level, suppressing info/debug", () => {
    const logger = new Logger();
    expect(logger.getLevel()).toBe("warn");
    logger.debug("hidden");
    logger.info("hidden");
    logger.warn("shown");
    logger.error("shown");
    expect(debugSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith("[fullKONK_>]", "shown");
    expect(errorSpy).toHaveBeenCalledWith("[fullKONK_>]", "shown");
  });

  it("'silent' suppresses every level including error", () => {
    const logger = new Logger("silent");
    logger.error("nope");
    logger.warn("nope");
    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("'debug' level enables every log method", () => {
    const logger = new Logger("debug");
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");
    expect(debugSpy).toHaveBeenCalled();
    expect(infoSpy).toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it("setLevel() changes verbosity at runtime", () => {
    const logger = new Logger("error");
    logger.warn("hidden");
    expect(warnSpy).not.toHaveBeenCalled();

    logger.setLevel("warn");
    logger.warn("shown");
    expect(warnSpy).toHaveBeenCalled();
  });

  it("passes extra arguments through to the underlying console method", () => {
    const logger = new Logger("debug");
    const details = { provider: "groq" };
    logger.debug("failover", details);
    expect(debugSpy).toHaveBeenCalledWith("[fullKONK_>]", "failover", details);
  });
});

describe("Logger environment-driven default level", () => {
  const ORIGINAL_ENV = process.env.FULLKONK_LOG_LEVEL;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.FULLKONK_LOG_LEVEL;
    else process.env.FULLKONK_LOG_LEVEL = ORIGINAL_ENV;
  });

  it("reads a valid FULLKONK_LOG_LEVEL from process.env at construction time", () => {
    process.env.FULLKONK_LOG_LEVEL = "debug";
    const logger = new Logger();
    expect(logger.getLevel()).toBe("debug");
  });

  it("falls back to 'warn' for an invalid FULLKONK_LOG_LEVEL value", () => {
    process.env.FULLKONK_LOG_LEVEL = "not-a-real-level";
    const logger = new Logger();
    expect(logger.getLevel()).toBe("warn");
  });
});
