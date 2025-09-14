-- Summary views for quote_pages
create view if not exists v_file_summary as
select
  quote_id,
  file_token,
  any_value(file_name) as file_name,
  max(page_count) as total_pages,
  sum(word_count) as total_words,
  count(*) filter (where method = 'ocr') as pages_ocr,
  count(*) filter (where method = 'digital') as pages_digital
from quote_pages
group by quote_id, file_token;

create view if not exists v_quote_summary as
select
  quote_id,
  count(distinct file_token) as total_files,
  sum(total_words) as total_words,
  sum(total_pages) as total_pages
from v_file_summary
group by quote_id;
