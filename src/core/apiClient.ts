import { isCompressionFormat, type ImageOutputFormat, type ImageQuality } from "./imageOptions";
import { normalizeBaseUrl, type AppConfig, type ImageResponseMode } from "./config";
import { safeErrorMessage } from "./errorSanitizer";

export type TextRequestInput = {
  model: string;
  input: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
};

export type ChatRequestInput = {
  model: string;
  system: string;
  user: string;
};

export type ImageRequestInput = {
  model: string;
  prompt: string;
  size: string;
  quality: ImageQuality;
  n: number;
  outputFormat: ImageOutputFormat;
  outputCompression: number;
  responseMode: ImageResponseMode;
};

export type ImageEditRequestInput = ImageRequestInput & {
  referenceImages: File[];
};

export type ParsedImage = {
  base64?: string;
  url?: string;
  revisedPrompt?: string;
};

export type RequestJsonInput = {
  path: string;
  body: unknown;
};

export type RequestMultipartInput = {
  path: string;
  body: FormData;
};

const IMAGES_PER_TASK = 1;

type ApiClientErrorKind = "timeout" | "http" | "network";

type ChatMessageContentPart = {
  type?: string;
  text?: string;
};

type JsonRecord = Record<string, unknown>;

const CONNECTIVITY_REFERENCE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAACQeSURBVHheFdChkgEAAEBBQRAEQRAEQVAEQRAEQRAEQRAEQRAEQRAUQRAEQRAEQRAE80YQBEEQBEUQBEEQBEEQ3s3tJ2wgEMBgAEMBDAcwEsBoAGMBjAcwEcBkAFMBTAcwE8BsAHMBzAewEMBiAEsBLAewEsBqAGsBrAewEcBmAFsBbAewE8BuAHsB7AdwEMBhAEcBHAdwEsBpAGcBnAdwEcBlAFcBXAdwE8BtAHcB3AfwEMBjAE8BPAfwEsBrAG8BvAfwEcBnAF8BfAfwE8BvAH8BNICBQBCDQQwFMRzESBCjQYwFMR7ERBCTQUwFMR3ETBCzQcwFMR/EQhCLQSwFsRzEShCrQawFsR7ERhCbQWwFsR3EThC7QewFsR/EQRCHQRwFcRzESRCnQZwFcR7ERRCXQVwFcR3ETRC3QdwFcR/EQxCPQTwF8RzESxCvQbwF8R7ERxCfQXwF8R3ETxC/QfwF0eB/QAiDIQyFMBzCSAijIYyFMB7CRAiTIUyFMB3CTAizIcyFMB/CQgiLISyFsBzCSgirIayFsB7CRgibIWyFsB3CTgi7IeyFsB/CQQiHIRyFcBzCSQinIZyFcB7CRQiXIVyFcB3CTQi3IdyFcB/CQwiPITyF8BzCSwivIbyF8B7CRwifIXyF8B3CTwi/IfyF0NB/QBiDYQyFMRzGSBijYYyFMR7GRBiTYUyFMR3GTBizYcyFMR/GQhiLYSyFsRzGShirYayFsR7GRhibYWyFsR3GThi7YeyFsR/GQRiHYRyFcRzGSRinYZyFcR7GRRiXYVyFcR3GTRi3YdyFcR/GQxiPYTyF8RzGSxivYbyF8R7GRxifYXyF8R3GTxi/YfyF0fB/QASDEQxFMBzBSASjEYxFMB7BRASTEUxFMB3BTASzEcxFMB/BQgSLESxFsBzBSgSrEaxFsB7BRgSbEWxFsB3BTgS7EexFsB/BQQSHERxFcBzBSQSnEZxFcB7BRQSXEVxFcB3BTQS3EdxFcB/BQwSPETxF8BzBSwSvEbxF8B7BRwSfEXxF8B3BTwS/EfxF0Mh/QBSDUQxFMRzFSBSjUYxFMR7FRBSTUUxFMR3FTBSzUcxFMR/FQhSLUSxFsRzFShSrUaxFsR7FRhSbUWxFsR3FThS7UexFsR/FQRSHURxFcRzFSRSnUZxFcR7FRRSXUVxFcR3FTRS3UdxFcR/FQxSPUTxF8RzFSxSvUbxF8R7FRxSfUXxF8R3FTxS/UfxF0eh/QAyDMQzFMBzDSAyjMYzFMB7DRAyTMUzFMB3DTAyzMczFMB/DQgyLMSzFsBzDSgyrMazFsB7DRgybMWzFsB3DTgy7MezFsB/DQQyHMRzFcBzDSQynMZzFcB7DRQyXMVzFcB3DTQy3MdzFcB/DQwyPMTzF8BzDSwyvMbzF8B7DRwyfMXzF8B3DTwy/MfzF0Nh/QByDcQzFMRzHSByjcYzFMR7HRByTcUzFMR3HTByzcczFMR/HQhyLcSzFsRzHShyrcazFsR7HRhybcWzFsR3HThy7cezFsR/HQRyHcRzFcRzHSRyncZzFcR7HRRyXcVzFcR3HTRy3cdzFcR/HQxyPcTzF8RzHSxyvcbzF8R7HRxyfcXzF8R3HTxy/cfzF0fh/QAKDCQwlMJzASAKjCYwlMJ7ARAKTCUwlMJ3ATAKzCcwlMJ/AQgKLCSwlsJzASgGrBawVsF7ARgGbBWwVsF3ATgG7BewVsF/AQQGHBRwVcFzASQGnBZwVcF7ARQGXBVwVcF3ATQG3BdwVcF/AwwGPBTwV8FzASwGvBbwV8F7ARwGfBXwV8F3ATwG/BfwV0MJ/QBGDRQwVMVzESBGjRYwVMV7ERBGTRUwVMV3ETBGzRcwVMV/EQhGLRSwVsVzEShGrRawVsV7ERhGbRWwVsV3EThG7RewVsV/EQRGHRRwVcVzESRGnRZwVcV7ERRGXRVwVcV3ETRG3RdwVcV/EQxGPRTwV8VzESxGvRbwV8V7ERxGfRXwV8V3ETxG/RfwV0eJ/QAmDJQyVMFzCSAmjJYyVMF7CRAmTJUyVMF3CTAmzJcyVMF/CQgmLJSyVsFzCSgmrJayVsF7CRgmbJWyVsF3CTgm7JeyVsF/CQQmHJRyVcFzCSQmnJZyVcF7CRQmXJVyVcF3CTQm3JdyVcF/CQwmPJTyV8FzCSwmvJbyV8F7CRwmfJXyV8F3CTwm/JfyV0NJ/QBmDZQyVMVzGSBmjZYyVMV7GRBmTZUyVMV3GTBmzZcyVMV/GQhmLZSyVsVzGShmrZayVsV7GRhmbZWyVsV3GThm7ZeyVsV/GQRmHZRyVcVzGSRmnZZyVcV7GRRmXZVyVcV3GTRm3ZdyVcV/GQxmPZTyV8VzGSxmvZbyV8V7GRxmfZXyV8V3GTxm/ZfyV0fJ/QAWDFQxVMFzBSAWjFYxVMF7BRAWTFUxVMF3BTAWzFcxVMF/BQgWLFSxVsFzBSgWrFaxVsF7BRgWbFWxVsF3BTgW7FexVsF/BQQWHFRxVcFzBSQWnFZxVcF7BRQWXFVxVcF3BTQW3FdxVcF/BQwWPFTxV8FzBSwWvFbxV8F7BRwWfFXxV8F3BTwW/FfxV0Mp/QBWDVQxVMVzFSBWjVYxVMV7FRBWTVUxVMV3FTBWzVcxVMV/FQhWLVSxVsVzFShWrVaxVsV7FRhWbVWxVsV3FThW7VexVsV/FQRWHVRxVcVzFSRWnVZxVcV7FRRWXVVxVcV3FTRW3VdxVcV/FQxWPVTxV8VzFSxWvVbxV8V7FRxWfVXxV8V3FTxW/VfxV0ep/QA2DNQzVMFzDSA2jNYzVMF7DRA2TNUzVMF3DTA2zNczVMF/DQg2LNSzVsFzDSg2rNazVsF7DRg2bNWzVsF3DTg27NezVsF/DQQ2HNRzVcFzDSQ2nNZzVcF7DRQ2XNVzVcF3DTQ23NdzVcF/DQw2PNTzV8FzDSw2vNbzV8F7DRw2fNXzV8F3DTw2/NfzV0Np/QB2DdQzVMVzHSB2jdYzVMV7HRB2TdUzVMV3HTB2zdczVMV/HQh2LdSzVsVzHSh2rdazVsV7HRh2bdWzVsV3HTh27dezVsV/HQR2HdRzVcVzHSR2ndZzVcV7HRR2XdVzVcV3HTR23ddzVcV/HQx2PdTzV8VzHSx2vdbzV8V7HRx2fdXzV8V3HTx2/dfzV0fp/QAODDQw1MNzASAOjDYw1MN7ARAOTDUw1MN3ATAOzDcw1MN/AQgOLDSw1sNzASgOrDaw1sN7ARgObDWw1sN3ATgO7Dew1sN/AQQOHDRw1cNzASQOnDZw1cN7ARQOXDVw1cN3ATQO3Ddw1cN/AQwOPDTw18NzASwOvDbw18N7ARwOfDXw18N3ATwO/Dfw10MZ/QBODTQw1MdzESBOjTYw1Md7ERBOTTUw1Md3ETBOzTcw1Md/EQhOLTSw1sdzEShOrTaw1sd7ERhObTWw1sd3EThO7Tew1sd/EQROHTRw1cdzESROnTZw1cd7ERROXTVw1cd3ETRO3Tdw1cd/EQxOPTTw18dzESxOvTbw18d7ERxOfTXw18d3ETxO/Tfw10eZ/QAuDLQy1MNzCSAujLYy1MN7CRAuTLUy1MN3CTAuzLcy1MN/CQguLLSy1sNzCSgurLay1sN7CRgubLWy1sN3CTgu7Ley1sN/CQQuHLRy1cNzCSQunLZy1cN7CRQuXLVy1cN3CTQu3Ldy1cN/CQwuPLTy18NzCSwuvLby18N7CRwufLXy18N3CTwu/Lfy10NZ/QBuDbQy1MdzGSBujbYy1Md7GRBuTbUy1Md3GTBuzbcy1Md/GQhuLbSy1sdzGShurbay1sd7GRhubbWy1sd3GThu7bey1sd/GQRuHbRy1cdzGSRunbZy1cd7GRRuXbVy1cd3GTRu3bdy1cd/GQxuPbTy18dzGSxuvbby18d7GRxufbXy18d3GTxu/bfy10fZ/QAeDHQx1MNzBSAejHYx1MN7BRAeTHUx1MN3BTAezHcx1MN/BQgeLHSx1sNzBSgerHax1sN7BRgebHWx1sN3BTge7Hex1sN/BQQeHHRx1cNzBSQenHZx1cN7BRQeXHVx1cN3BTQe3Hdx1cN/BQwePHTx18NzBSwevHbx18N7BRwefHXx18N3BTwe/Hfx10M5/QBeDXQx1MdzFSBejXYx1Md7FRBeTXUx1Md3FTBezXcx1Md/FQheLXSx1sdzFSherXax1sd7FRhebXWx1sd3FThe7Xex1sd/FQReHXRx1cdzFSRenXZx1cd7FRReXXVx1cd3FTRe3Xdx1cd/FQxePXTx18dzFSxevXbx18d7FRxefXXx18d3FTxe/Xfx10e5/QA+DPQz1MNzDSA+jPYz1MN7DRA+TPUz1MN3DTA+zPcz1MN/DQg+LPSz1sNzDSg+rPaz1sN7DRg+bPWz1sN3DTg+7Pez1sN/DQQ+HPRz1cNzDSQ+nPZz1cN7DRQ+XPVz1cN3DTQ+3Pdz1cN/DQw+PPTz18NzDSw+vPbz18N7DRw+fPXz18N3DTw+/Pfz10N5/QB+DfQz1MdzHSB+jfYz1Md7HRB+TfUz1Md3HTB+zfcz1Md/HQh+LfSz1sdzHSh+rfaz1sd7HRh+bfWz1sd3HTh+7fez1sd/HQR+HfRz1cdzHSR+nfZz1cd7HRR+XfVz1cd3HTR+3fdz1cd/HQx+PfTz18dzHSx+vfbz18d7HRx+ffXz18d3HTx+/ffz10f5/wACDAwwNMDzAyACjA4wNMD7AxACTA0wNMD3AzACzA8wNMD/AwgCLAywNsDzAygCrA6wNsD7AxgCbA2wNsD3AzgC7A+wNsD/AwQCHAxwNcDzAyQCnA5wNcD7AxQCXA1wNcD3AzQC3A9wNcD/AwwCPAzwN8DzAywCvA7wN8D7AxwCfA3wN8D3AzwC/A/wN0MF/wBCDQwwNMTzEyBCjQ4wNMT7ExBCTQ0wNMT3EzBCzQ8wNMT/EwhCLQywNsTzEyhCrQ6wNsT7ExhCbQ2wNsT3EzhC7Q+wNsT/EwRCHQxwNcTzEyRCnQ5wNcT7ExRCXQ1wNcT3EzRC3Q9wNcT/EwxCPQzwN8TzEyxCvQ7wN8T7ExxCfQ3wN8T3EzxC/Q/wN0eF/wAiDIwyNMDzCyAijI4yNMD7CxAiTI0yNMD3CzAizI8yNMD/CwgiLIyyNsDzCygirI6yNsD7CxgibI2yNsD3Czgi7I+yNsD/CwQiHIxyNcDzCyQinI5yNcD7CxQiXI1yNcD3CzQi3I9yNcD/CwwiPIzyN8DzCywivI7yN8D7CxwifI3yN8D3Czwi/I/yN0NF/wBiDYwyNMTzGyBijY4yNMT7GxBiTY0yNMT3GzBizY8yNMT/GwhiLYyyNsTzGyhirY6yNsT7GxhibY2yNsT3Gzhi7Y+yNsT/GwRiHYxyNcTzGyRinY5yNcT7GxRiXY1yNcT3GzRi3Y9yNcT/GwxiPYzyN8TzGyxivY7yN8T7GxxifY3yN8T3Gzxi/Y/yN0fF/wASDEwxNMDzByASjE4xNMD7BxASTE0xNMD3BzASzE8xNMD/BwgSLEyxNsDzBygSrE6xNsD7BxgSbE2xNsD3BzgS7E+xNsD/BwQSHExxNcDzByQSnE5xNcD7BxQSXE1xNcD3BzQS3E9xNcD/BwwSPEzxN8DzBywSvE7xN8D7BxwSfE3xN8D3BzwS/E/xN0Ml/wBSDUwxNMTzFyBSjU4xNMT7FxBSTU0xNMT3FzBSzU8xNMT/FwhSLUyxNsTzFyhSrU6xNsT7FxhSbU2xNsT3FzhS7U+xNsT/FwRSHUxxNcTzFyRSnU5xNcT7FxRSXU1xNcT3FzRS3U9xNcT/FwxSPUzxN8TzFyxSvU7xN8T7FxxSfU3xN8T3FzxS/U/xN0el/wAyDMwzNMDzDyAyjM4zNMD7DxAyTM0zNMD3DzAyzM8zNMD/DwgyLMyzNsDzDygyrM6zNsD7DxgybM2zNsD3Dzgy7M+zNsD/DwQyHMxzNcDzDyQynM5zNcD7DxQyXM1zNcD3DzQy3M9zNcD/DwwyPMzzN8DzDywyvM7zN8D7DxwyfM3zN8D3Dzwy/M/zN0Nl/wByDcwzNMTzHyByjc4zNMT7HxByTc0zNMT3HzByzc8zNMT/HwhyLcyzNsTzHyhyrc6zNsT7Hxhybc2zNsT3Hzhy7c+zNsT/HwRyHcxzNcTzHyRync5zNcT7HxRyXc1zNcT3HzRy3c9zNcT/HwxyPczzN8TzHyxyvc7zN8T7Hxxyfc3zN8T3Hzxy/c/zN0fl/wAKDCwwtMLzAyAKjC4wtML7AxAKTC0wtML3AzAKzC8wtML/AwgKLCywtsLzAygKrC6wtsL7AxgKbC2wtsL3AzgK7C+wtsL/AwQKHCxwtcLzAyQKnC5wtcL7AxQKXC1wtcL3AzQK3C9wtcL/AwwKPCzwt8LzAywKvC7wt8L7AxwKfC3wt8L3AzwK/C/wt0MV/wBKDSwwtMbzEyBKjS4wtMb7ExBKTS0wtMb3EzBKzS8wtMb/EwhKLSywtsbzEyhKrS6wtsb7ExhKbS2wtsb3EzhK7S+wtsb/EwRKHSxwtcbzEyRKnS5wtcb7ExRKXS1wtcb3EzRK3S9wtcb/EwxKPSzwt8bzEyxKvS7wt8b7ExxKfS3wt8b3EzxK/S/wt0eV/wAqDKwytMLzCyAqjK4ytML7CxAqTK0ytML3CzAqzK8ytML/CwgqLKyytsLzCygqrK6ytsL7CxgqbK2ytsL3Czgq7K+ytsL/CwQqHKxytcLzCyQqnK5ytcL7CxQqXK1ytcL3CzQq3K9ytcL/CwwqPKzyt8LzCywqvK7yt8L7CxwqfK3yt8L3Czwq/K/yt0NV/wBqDawytMbzGyBqja4ytMb7GxBqTa0ytMb3GzBqza8ytMb/GwhqLayytsbzGyhqra6ytsb7Gxhqba2ytsb3Gzhu7b+ytsb/GwRqHaxytcbzGyRqna5ytcb7GxRqXa1ytcb3GzRq3a9ytcb/GwxqPazyt8bzGyxqva7yt8b7Gxxqfa3yt8b3Gzxq/a/yt0fV/wAaDGwxtMLzByAajG4xtML7BxAaTG0xtML3BzAazG8xtML/BwgaLGyxtsLzBygarG6xtsL7BxgabG2xtsL3Bzga7G+xtsL/BwQaHGxxtcLzByQanG5xtcL7BxQaXG1xtcL3BzQa3G9xtcL/BwwaPGzxt8LzBywavG7xt8L7BxwafG3xt8L3Bzwa/G/xt0M1/wBaDWwxtMbzFyBajW4xtMb7FxBaTW0xtMb3FzBazW8xtMb/FwhaLWyxtsbzFyharW6xtsb7FxhabW2xtsb3Fzha7W+xtsb/FwRaHWxxtcbzFyRanW5xtcb7FxRaXW1xtcb3FzRa3W9xtcb/FwxaPWzxt8bzFyxavW7xt8b7FxxafW3xt8b3FzxW/V/xt0e1/wA6DOwztMLzDyA6jO4ztML7DxA6TO0ztML3DzA6zO8ztML/Dwg6LOyztsLzDyg6rO6ztsL7Dxg6bO2ztsL3Dzg67O+ztsL/DwQ6HOxztcLzDyQ6nO5ztcL7DxQ6XO1ztcL3DzQ63O9ztcL/Dww6POzzt8LzDyw6vO7zt8L7Dxw6fO3zt8L3Dzw6/O/zt0N1/wB6DewztMbzHyB6je4ztMb7HxB6Te0ztMb3HzB6ze8ztMb/Hwh6LeyztsbzHyh6re6ztsb7Hxh6be2ztsb3Hzh67e+ztsb/HwR6HexztcbzHyR6ne5ztcb7HxR6Xe1ztcb3HzR63e9ztcb/Hwx6Pezzt8bzHyx6ve7zt8b7Hxx6fe3zt8b3Hzx6/e/zt0f1/wAGDBwwdMHzAyAGjB4wdMH7AxAGTB0wdMH3AzAGzB8wdMH/AwgGLBywdsHzAygGrB6wdsH7AxgGbB2wdsH3AzgG7B+wdsH/AwQGHBxwdcHzAyQGnB5wdcH7AxQGXB1wdcH3AzQG3B9wdcH/AwwGPBzwd8HzAywGvB7wd8H7AxwGfB3wd8H3AzwG/B/wd0MN/wBGDRwwdMXzEyBGjR4wdMX7ExBGTR0wdMX3EzBGzR8wdMX/EwhGLRywdsXzEyhGrR6wdsX7ExhGbR2wdsX3EzhG7R+wdsX/EwRGHRxwdcXzEyRGnR5wdcX7ExRGXR1wdcX3EzRG3R9wdcX/EwxGPRzwd8XzEyxGvR7wd8X7ExxGfR3wd8X3EzxG/R/wd0eN/wAmDJwydMHzCyAmjJ4ydMH7CxAmTJ0ydMH3CzAmzJ8ydMH/CwgmLJyydsHzCygmrJ6ydsH7CxgmbJ2ydsH3Czgm7J+ydsH/CwQmHJxydcHzCyQmnJ5ydcH7CxQmXJ1ydcH3CzQm3J9ydcH/CwwmPJzyd8HzCywmvJ7yd8H7CxwmfJ3yd8H3Czwm/J/yd0NN/wBmDZwydMXzGyBmjZ4ydMX7GxBmTZ0ydMX3GzBmzZ8ydMX/GwhmLZyydsXzGyhmrZ6ydsX7GxhmbZ2ydsX3Gzhm7Z+ydsX/GwRmHZxydcXzGyRmnZ5ydcX7GxRmXZ1ydcX3GzRm3Z9ydcX/GwxmPZzyd8XzGyxmvZ7yd8X7GxxmfZ3yd8X3Gzxm/Z/yd0fN/wAWDFwxdMHzByAWjF4xdMH7BxAWTF0xdMH3BzAWzF8xdMH/BwgWLFyxdsHzBygWrF6xdsH7BxgWbF2xdsH3BzgW7F+xdsH/BwQWHFxxdcHzByQWnF5xdcH7BxQWXF1xdcH3BzQW3F9xdcH/BwwWPFzxd8HzBywWvF7xd8H7BxwWfF3xd8H3BzwW/F/xd0Mt/wBWDVwxdMXzFyBWjV4xdMX7FxBWTV0xdMX3FzBWzV8xdMX/FwhWLVyxdsXzFyhWrV6xdsX7FxhWbV2xdsX3FzhW7V+xdsX/FwRWHVxxdcXzFyRWnV5xdcX7FxRWXV1xdcX3FzRW3V9xdcX/FwxWPVzxd8XzFyxWvV7xd8X7FxxWfV3xd8X3FzxW/V/xd0et/wA2DNwzdMHzDyA2jN4zdMH7DxA2TN0zdMH3DzA2zN8zdMH/Dwg2LNyzdsHzDyg2rN6zdsH7Dxg2bN2zdsH3Dzg27N+zdsH/DwQ2HNxzdcHzDyQ2nN5zdcH7DxQ2XN1zdcH3DzQ23N9zdcH/Dww2PNzzd8HzDyw2vN7zd8H7Dxw2fN3zd8H3Dzw2/N/zd0Nt/wB2DdwzdMXzHyB2jd4zdMX7HxB2Td0zdMX3HzB2zd8zdMX/Hwh2LdyzdsXzHyh2rd6zdsX7Hxh2bd2zdsX3Hzh27d+zdsX/HwR2HdxzdcXzHyR2nd5zdcX7HxR2Xd1zdcX3HzR23d9zdcX/Hwx2Pdzzd8XzHyx2vd7zd8X7Hxx2fd3zd8X3Hzx2/d/zd0ft/wAODDww9MPzAyAOjD4w9MP7AxAOTD0w9MP3AzAOzD8w9MP/AwgOLDyw9sPzAygOrD6w9sP7AxgObD2w9sP3AzgO7D+w9sP/AwQOHDxw9cPzAyQOnD5w9cP7AxQOXD1w9cP3AzQO3D9w9cP/AwwOPDzw98PzAywOvD7w98P7AxwOfD3w98P3AzwO/D/w90Md/wBODTww9MfzEyBOjT4w9Mf7ExBOTT0w9Mf3EzBOzT8w9Mf/EwhOLTyw9sfzEyhOrT6w9sf7ExhObT2w9sf3EzhO7T+w9sf/EwROHTxw9cfzEyROnT5w9cf7ExROXT1w9cf3EzRO3T9wdcf/EwxOPTzw98fzEyxOvT7w98f7ExxOfT3w98f3EzxO/T/w90ed/wAuDLwy9MPzCyAujL4y9MP7CxAuTL0y9MP3CzAuzL8y9MP/CwguLLyy9sPzCygurL6y9sP7CxgubL2y9sP3Czgu7L+y9sP/CwQuHLxy9cPzCyQunL5y9cP7CxQuXL1y9cP3CzQu3L9y9cP/CwwuPLzy98PzCywuvL7y98P7CxwufL3y98P3Czwu/L/y90Nd/wBuDbwy9MfzGyBujb4y9Mf7GxBuTb0y9Mf3GzBuzb8y9Mf/GwhuLbyy9sfzGyhurb6y9sf7Gxhubb2y9sf3Gzhu7b+y9sf/GwRuHbxy9cfzGyRunb5y9cf7GxRuXb1y9cf3GzRu3b9y9cf/GwxuPbzy98fzGyxuvb7y98f7Gxxufb3y98f3Gzxu/b/y90fd/wAeDHwx9MPzByAejH4x9MP7BxAeTH0x9MP3BzAezH8x9MP/BwgeLHyx9sPzBygerH6x9sP7BxgebH2x9sP3Bzge7H+x9sP/BwQeHHxx9cPzByQenH5x9cP7BxQeXH1x9cP3BzQe3H9x9cP/BwwePHzx98PzBywevH7x98P7BxwefH3x98P3Bzwe/H/x90M9/wBeDXwx9MfzFyBejX4x9Mf7FxBeTX0x9Mf3FzBezX8x9Mf/FwheLXyx9sfzFyherX6x9sf7FxhebX2x9sf3Fzhe7X+x9sf/FwReHXxx9cfzFyRenX5x9cf7FxReXX1x9cf3FzRe3X9x9cf/FwxePXzx98fzFyxevX7x98f7FxxefX3x98f3Fzxe/X/x90e9/wA+DPwz9MPzDyA+jP4z9MP7DxA+TP0z9MP3DzA+zP8z9MP/Dwg+LPyz9sPzDyg+rP6z9sP7Dxg+bP2z9sP3Dzg+7P+z9sP/DwQ+HPxz9cPzDyQ+nP5z9cP7DxQ+XP1z9cP3DzQ+3P9z9cP/Dww+PPzz98PzDyw+vP7z98P7Dxw+fP3z98P3Dzw+/P/z90N9/gBgUQ2JYjIhRMSbGxYSYFFNiWsyIWTEn5sWCWBRLYlmsiFWxJtbFhtgUW2Jb7IhdsSf2xYE4FEfiWJyIU3EmzsWFuBRX4lrciFtxJ+7Fg3gUT+JZvIhX8SbexYf4FF/iW/yIX/EnKv4BBv8ihgEoanwAAAAASUVORK5CYII=";

const CONNECTIVITY_REFERENCE_PROVIDER_SAFE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAFUSURBVHhe7dAxbsQwDETR7bdImTvk0Lll6gQqFgh+I5ImZWI5xWsGsDmax8/383eyB4NpNACDaTQAg2k0AINpNACDaTQAg2k0AINKH59fZvy2SvkAfFgE/5mpbAA+IgNvZCgZgMUz8dZVqQOwbCXejkobgAVPYIeIlAFY7CR28dIADLxY6A7s5HFpABa5E7tZaQAGVizQATtaaAAGVjzeATtahAbg4U7YdUcDMLDg0U7YdUcDMLDg0U7Ydcc9AA92w7477gEWHu2EXXc0AAMLHu2EXXc0AAMLHu2EXXdCAyw83AV77rzVAOxooQEYeLDAndjNSgMw8GKRO7CTx+UBFhY6iV28NACDKBY7gR0i0gZYWLASb0elDvDCspl466qSARYWz8AbGcoGeOEjIvjPTOUD/MeH7fD7CkcH6EgDMJhGAzCYRgMwmEYDMJhGAzCYZvwAfydwgD6gnpkYAAAAAElFTkSuQmCC";

class ApiClientError extends Error {
  kind: ApiClientErrorKind;
  status?: number;
  responseBody?: string;

  constructor(message: string, options: { kind: ApiClientErrorKind; status?: number; responseBody?: string }) {
    super(message);
    this.name = "ApiClientError";
    this.kind = options.kind;
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

export function buildResponsesRequest({ model, input }: TextRequestInput) {
  return { model, input };
}

export function buildChatCompletionsRequest({ model, system, user }: ChatRequestInput) {
  return {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

export function buildImageGenerationRequest({
  model,
  prompt,
  size,
  quality,
  outputFormat,
  outputCompression,
  responseMode,
}: ImageRequestInput) {
  const payload: Record<string, string | number> = {
    model,
    prompt,
    size,
    quality,
    n: IMAGES_PER_TASK,
    output_format: outputFormat,
  };

  if (responseMode === "force-base64") {
    payload.response_format = "b64_json";
  }

  if (isCompressionFormat(outputFormat)) {
    payload.output_compression = outputCompression;
  }

  return payload;
}

export function buildImageEditRequest({
  model,
  prompt,
  size,
  quality,
  outputFormat,
  outputCompression,
  responseMode,
  referenceImages,
}: ImageEditRequestInput) {
  const payload = new FormData();
  payload.set("model", model);
  payload.set("prompt", prompt);
  payload.set("size", size);
  payload.set("quality", quality);
  payload.set("n", String(IMAGES_PER_TASK));
  if (responseMode === "force-base64") {
    payload.set("response_format", "b64_json");
  }
  payload.set("output_format", outputFormat);
  if (isCompressionFormat(outputFormat)) {
    payload.set("output_compression", String(outputCompression));
  }

  for (const image of referenceImages) {
    payload.append("image", image, image.name);
  }

  return payload;
}

export function parseTextResponse(payload: unknown): string {
  const record = asRecord(payload);
  const outputText = asString(record.output_text);

  if (outputText) {
    return outputText;
  }

  const output = Array.isArray(record.output) ? record.output : [];
  const responseSegments: string[] = [];
  for (const item of output) {
    const itemRecord = asRecord(item);
    const content = Array.isArray(itemRecord.content) ? itemRecord.content : [];

    for (const part of content) {
      const text = readChatContentPart(asRecord(part));
      if (text) {
        responseSegments.push(text);
      }
    }
  }

  if (responseSegments.length > 0) {
    return responseSegments.join("\n");
  }

  const choices = Array.isArray(record.choices) ? record.choices : [];
  const firstChoice = asRecord(choices[0]);
  const message = asRecord(firstChoice.message);
  const content = message.content;

  if (typeof content === "string" && content) {
    return content;
  }

  if (Array.isArray(content)) {
    const combined = content
      .map((part) => readChatContentPart(asRecord(part)))
      .filter(Boolean)
      .join("\n")
      .trim();

    if (combined) {
      return combined;
    }
  }

  throw new Error("Text response did not contain any readable content.");
}

export function parseImageGenerationResponse(payload: unknown): ParsedImage[] {
  const record = asRecord(payload);
  const providerError = readProviderErrorMessage(record);
  if (providerError) {
    throw new ApiClientError(safeErrorMessage({ status: 200, payload: record }), {
      kind: "http",
      status: 200,
      responseBody: safeJsonStringify(record),
    });
  }

  const data = Array.isArray(record.data) ? record.data : [];
  const images = data
    .map((entry) => {
      const item = asRecord(entry);
      const parsed: ParsedImage = {};
      const base64 = firstNonEmptyString(item.b64_json, item.base64, item.image_base64);
      const url = firstNonEmptyString(item.url, item.image_url);
      const revisedPrompt = asString(item.revised_prompt);

      if (base64) {
        parsed.base64 = base64;
      }

      if (url) {
        parsed.url = url;
      }

      if (revisedPrompt) {
        parsed.revisedPrompt = revisedPrompt;
      }

      return parsed.base64 || parsed.url ? parsed : null;
    })
    .filter((item): item is ParsedImage => item !== null);

  if (images.length > 0) {
    return images;
  }

  throw new Error("Image generation response did not contain any image data.");
}

export async function requestJsonWithTimeout(config: AppConfig, { path, body }: RequestJsonInput) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = config.timeoutSeconds * 1_000;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await readResponseText(response);
      throw new ApiClientError(`Request failed with status ${response.status}.`, {
        kind: "http",
        status: response.status,
        responseBody: details,
      });
    }

    return response.json();
  } catch (error) {
    if (timedOut || isAbortError(error)) {
      throw new ApiClientError(`Request timed out after ${config.timeoutSeconds} seconds.`, {
        kind: "timeout",
      });
    }

    if (error instanceof ApiClientError) {
      throw error;
    }

    throw new ApiClientError(safeErrorMessage(error), {
      kind: "network",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function requestMultipartWithTimeout(config: AppConfig, { path, body }: RequestMultipartInput) {
  const controller = new AbortController();
  let timedOut = false;
  const timeoutMs = config.timeoutSeconds * 1_000;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      const details = await readResponseText(response);
      throw new ApiClientError(`Request failed with status ${response.status}.`, {
        kind: "http",
        status: response.status,
        responseBody: details,
      });
    }

    return response.json();
  } catch (error) {
    if (timedOut || isAbortError(error)) {
      throw new ApiClientError(`Request timed out after ${config.timeoutSeconds} seconds.`, {
        kind: "timeout",
      });
    }

    if (error instanceof ApiClientError) {
      throw error;
    }

    throw new ApiClientError(safeErrorMessage(error), {
      kind: "network",
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function sendTextRequest(config: AppConfig, system: string, user: string): Promise<string> {
  try {
    const responsesPayload = await requestJsonWithTimeout(config, {
      path: "/responses",
      body: buildResponsesRequest({
        model: config.textModel,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });

    return parseTextResponse(responsesPayload);
  } catch (error) {
    if (!shouldFallbackToChatCompletions(error)) {
      throw error;
    }

    const chatPayload = await requestJsonWithTimeout(config, {
      path: "/chat/completions",
      body: buildChatCompletionsRequest({
        model: config.textModel,
        system,
        user,
      }),
    });

    return parseTextResponse(chatPayload);
  }
}

export function testTextModel(config: AppConfig): Promise<string> {
  return sendTextRequest(
    config,
    "You are a connectivity test assistant. Reply with a short confirmation.",
    "Reply with OK.",
  );
}

export function optimizePrompt(config: AppConfig, prompt: string): Promise<string> {
  return sendTextRequest(
    config,
    "You improve image generation prompts. Return only the revised prompt.",
    prompt,
  );
}

export async function generateImages(
  config: AppConfig,
  prompt: string,
  options?: { referenceImages?: File[] },
): Promise<ParsedImage[]> {
  const referenceImages = options?.referenceImages?.filter((file) => file instanceof File) ?? [];
  const payload = referenceImages.length > 0
    ? await requestMultipartWithTimeout(config, {
        path: "/images/edits",
        body: buildImageEditRequest({
          model: config.imageModel,
          prompt,
          size: config.defaultSize,
          quality: config.defaultQuality,
          n: IMAGES_PER_TASK,
          outputFormat: config.defaultFormat,
          outputCompression: config.defaultCompression,
          responseMode: config.imageResponseMode,
          referenceImages,
        }),
      })
    : await requestJsonWithTimeout(config, {
        path: "/images/generations",
        body: buildImageGenerationRequest({
          model: config.imageModel,
          prompt,
          size: config.defaultSize,
          quality: config.defaultQuality,
          n: IMAGES_PER_TASK,
          outputFormat: config.defaultFormat,
          outputCompression: config.defaultCompression,
          responseMode: config.imageResponseMode,
        }),
      });

  return parseImageGenerationResponse(payload);
}

export function testImageModel(config: AppConfig): Promise<ParsedImage[]> {
  return generateImages(config, "A plain single-color square swatch image.");
}

export function testImageEditModel(config: AppConfig): Promise<ParsedImage[]> {
  return generateImages(config, "Apply a minimal visible edit for a connectivity test.", {
    referenceImages: [createConnectivityReferenceImage()],
  });
}

function asRecord(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" ? (value as JsonRecord) : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = asString(value).trim();
    if (text) {
      return text;
    }
  }

  return "";
}

function readProviderErrorMessage(record: JsonRecord): string {
  const error = asRecord(record.error);
  return firstNonEmptyString(error.message, error.code, record.message);
}

function readChatContentPart(part: ChatMessageContentPart): string {
  if (part.type === "output_text" || part.type === "text") {
    return asString(part.text);
  }

  return "";
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : asRecord(error).name === "AbortError";
}

function shouldFallbackToChatCompletions(error: unknown): boolean {
  if (!(error instanceof ApiClientError) || error.kind !== "http") {
    return false;
  }

  if (error.status !== 404 && error.status !== 405 && error.status !== 501) {
    return false;
  }

  const haystack = `${error.message}\n${error.responseBody ?? ""}`.toLowerCase();
  return haystack.includes("unsupported endpoint")
    || haystack.includes("unsupported route")
    || haystack.includes("unsupported path")
    || haystack.includes("unknown endpoint")
    || haystack.includes("unknown route")
    || haystack.includes("unknown path")
    || haystack.includes("endpoint not implemented")
    || haystack.includes("route not implemented")
    || haystack.includes("path not implemented")
    || haystack.includes("method not allowed")
    || haystack.includes("no route");
}

function createConnectivityReferenceImage(): File {
  return new File([decodeBase64(CONNECTIVITY_REFERENCE_PROVIDER_SAFE_BASE64)], "connectivity-reference.png", {
    type: "image/png",
  });
}

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return buffer;
}

async function readResponseText(response: Response): Promise<string> {
  try {
    return (await response.text()).trim();
  } catch {
    return "";
  }
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}
