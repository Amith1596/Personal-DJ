export async function decodeFile(file: File, ctx: BaseAudioContext): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer();
  return await ctx.decodeAudioData(arrayBuffer);
}
