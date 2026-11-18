/**
 * The system sounds.
 * Values of the OS code live in system/config/; the code only uses them.
 */

// [frequency in Hz, start in s, length in s, wave]
export const SOUNDS = {
  startup: [[523.25, 0, 0.22], [659.25, 0.14, 0.22], [783.99, 0.28, 0.24], [1046.5, 0.42, 0.7]],
  shutdown: [[1046.5, 0, 0.2], [783.99, 0.14, 0.2], [659.25, 0.28, 0.22], [523.25, 0.42, 0.6]],
  notify: [[880, 0, 0.14], [1174.66, 0.1, 0.32]],
  error: [[233.08, 0, 0.14, 'square'], [196, 0.16, 0.26, 'square']],
  ding: [[783.99, 0, 0.22]]
};

/** The volume slider (0-100) is raised to this power, so low settings are still quiet. */
export const SOUND_VOLUME_CURVE = 1.6;

/** Loudness of a system sound at volume 100. */
export const SOUND_MAX_GAIN = 0.22;
