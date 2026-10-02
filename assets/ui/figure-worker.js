// Only loaded after the visitor chooses to download and start the local model.
let engine, generator, TextStreamer, stopCriteria;
self.onmessage = async ({data}) => {
  if (data.type === "stop") { engine?.interruptGenerate(); stopCriteria?.interrupt(); return; }
  try {
    if (data.type === "load") {
      if(data.device === "gpu"){
        const {CreateMLCEngine}=await import("https://esm.run/@mlc-ai/web-llm@0.2.85");
        engine = await CreateMLCEngine("Qwen3-0.6B-q4f16_1-MLC", {initProgressCallback: p => self.postMessage({type:"progress",progress:p.progress,text:p.text})}, {context_window_size:4096});
      } else {
        const lib=await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js");
        TextStreamer=lib.TextStreamer;stopCriteria=new lib.InterruptableStoppingCriteria();
        lib.env.allowLocalModels=false;lib.env.backends.onnx.wasm.numThreads=1;
        generator=await lib.pipeline("text-generation","onnx-community/Qwen2.5-0.5B-Instruct",{device:"wasm",dtype:"q4",progress_callback:p=>self.postMessage({type:"progress",progress:(p.progress||0)/100,text:p.status})});
      }
      self.postMessage({type:"ready",device:data.device});
    } else if (data.type === "chat" && engine) {
      const stream = await engine.chat.completions.create({messages:data.messages,stream:true,max_tokens:350,temperature:.45,extra_body:{enable_thinking:false}});
      let output = "";
      for await (const chunk of stream) { output += chunk.choices[0]?.delta?.content || ""; self.postMessage({type:"token",id:data.id,text:output}); }
      self.postMessage({type:"done",id:data.id,text:output});
    } else if (data.type === "chat" && generator) {
      stopCriteria.reset();let output="";
      const streamer=new TextStreamer(generator.tokenizer,{skip_prompt:true,skip_special_tokens:true,callback_function:text=>{output+=text;self.postMessage({type:"token",id:data.id,text:output});}});
      const result=await generator(data.messages,{max_new_tokens:140,do_sample:false,streamer,stopping_criteria:stopCriteria});
      const final=result[0]?.generated_text;
      self.postMessage({type:"done",id:data.id,text:Array.isArray(final)?final.at(-1).content:output});
    }
  } catch (error) { self.postMessage({type:"error",id:data.id,text:String(error.message || error)}); }
};
