-- Fixed categories only; never provider response text or API keys.
alter table public.logger_weekly_reports
  drop constraint logger_weekly_reports_error_detail_check;
alter table public.logger_weekly_reports
  add constraint logger_weekly_reports_error_detail_check
  check(error_detail is null or error_detail ~ '^(google_[0-9]{3}(_(high_demand|overloaded|capacity|unavailable|unknown))?|response_(incomplete|invalid|json|max_tokens|safety)|network|timeout|configuration|source_error|quota_error|generate_error|store_error)$');
