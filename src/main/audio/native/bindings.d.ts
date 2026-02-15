/**
 * Type declarations for the 'bindings' module
 * 
 * The bindings module is used to load native Node.js addons (.node files)
 * It provides a simple way to load compiled C++ modules
 */

declare module 'bindings' {
  /**
   * Load a native addon
   * 
   * @param name - The name of the binding or path to the .node file
   * @returns The loaded native module
   * 
   * @example
   * const addon = require('bindings')('audio_capture_native');
   */
  function bindings(name: string): any;

  export = bindings;
}
