-- apply_player_statistics 只給觸發器使用；不讓 anon / authenticated 透過 RPC 呼叫。
revoke execute on function public.apply_player_statistics() from public, anon, authenticated;
