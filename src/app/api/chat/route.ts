'use server';

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // 1. 获取前端传来的 messages (包含文本和图片)
    const { messages } = await req.json();

    // 2. 读取环境变量
    const apiKey = process.env.DOUBAO_API_KEY;
    const modelId = process.env.DOUBAO_MODEL_ID; 

    if (!apiKey || !modelId) {
      return NextResponse.json(
        { error: '请在 .env.local 配置 DOUBAO_API_KEY 和 DOUBAO_MODEL_ID' }, 
        { status: 500 }
      );
    }

    // 3. 发送请求 (对应你的 curl 命令)
    const resp = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`, // 对应 curl 的 -H "Authorization..."
      },
      body: JSON.stringify({
        model: modelId, // 这里填 "doubao-seed-1-6-vision-250815"
        messages: messages || [],
        stream: false, // 暂时关闭流式传输，方便调试
        temperature: 0.7,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error("豆包 API 报错:", text);
      return NextResponse.json({ error: text }, { status: resp.status });
    }

    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content ?? '';
    
    return NextResponse.json({ content });

  } catch (error: any) {
    console.error("服务器错误:", error);
    return NextResponse.json({ error: error?.message }, { status: 500 });
  }
}