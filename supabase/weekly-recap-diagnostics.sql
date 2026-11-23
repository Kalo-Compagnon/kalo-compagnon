-- Fixed machine-readable reasons only, without model responses or credentials.
alter table public.logger_weekly_reports add column error_detail text
  check(error_detail is null or error_detail ~ '^(google_[0-9]{3}|response_(incomplete|invalid|json|max_tokens|safety)|network|timeout|configuration|source_error|quota_error|generate_error|store_error)$');
