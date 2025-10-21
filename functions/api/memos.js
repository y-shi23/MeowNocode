// 处理memos相关的请求
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method;
  
  // 设置CORS头
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
  
  // 处理OPTIONS请求（预检请求）
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    if (method === 'GET') {
      const { results } = await env.DB
        .prepare('SELECT * FROM memos ORDER BY created_at DESC')
        .all();

      return new Response(JSON.stringify({ success: true, data: results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else if (method === 'POST') {
      // 创建或更新memo
      const body = await request.json();
      const { memo_id, content, tags, backlinks, audio_clips, created_at, updated_at } = body;
      
      if (!memo_id || !content) {
        return new Response(JSON.stringify({ error: '缺少必要参数' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      // 检查memo是否已存在
      const existingMemo = await env.DB
        .prepare('SELECT * FROM memos WHERE memo_id = ?')
        .bind(memo_id)
        .first();
      
      if (existingMemo) {
        // 更新现有memo
        await env.DB
          .prepare('UPDATE memos SET content = ?, tags = ?, backlinks = ?, audio_clips = ?, updated_at = ? WHERE memo_id = ?')
          .bind(
            content,
            JSON.stringify(tags || []),
            JSON.stringify(backlinks || []),
            JSON.stringify(audio_clips || []),
            updated_at || new Date().toISOString(),
            memo_id
          )
          .run();
      } else {
        // 插入新memo
        await env.DB
          .prepare('INSERT INTO memos (memo_id, content, tags, backlinks, audio_clips, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(
            memo_id,
            content,
            JSON.stringify(tags || []),
            JSON.stringify(backlinks || []),
            JSON.stringify(audio_clips || []),
            created_at || new Date().toISOString(),
            updated_at || new Date().toISOString()
          )
          .run();
      }
      
      return new Response(JSON.stringify({ success: true, message: 'Memo保存成功' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else if (method === 'DELETE') {
      // 删除memo
      const memoId = url.searchParams.get('memoId');
      
      if (!memoId) {
        return new Response(JSON.stringify({ error: '缺少memoId参数' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      await env.DB
        .prepare('DELETE FROM memos WHERE memo_id = ?')
        .bind(memoId)
        .run();
      
      return new Response(JSON.stringify({ success: true, message: 'Memo删除成功' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ error: '不支持的请求方法' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  } catch (error) {
    console.error('处理memos请求失败:', error);
    return new Response(JSON.stringify({
      success: false,
      message: '处理memos请求失败',
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}
