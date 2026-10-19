class PaginatedResponse<T> {
  final List<T> data;
  final int page;
  final int limit;
  final int total;

  const PaginatedResponse({
    required this.data,
    required this.page,
    required this.limit,
    required this.total,
  });

  factory PaginatedResponse.fromJson(
    Map<String, dynamic> json,
    T Function(Map<String, dynamic>) fromItem,
  ) {
    final meta = json['meta'] as Map<String, dynamic>;
    final items = (json['data'] as List)
        .map((e) => fromItem(e as Map<String, dynamic>))
        .toList();

    return PaginatedResponse(
      data: items,
      page: meta['page'] as int,
      limit: meta['limit'] as int,
      total: meta['total'] as int,
    );
  }

  int get totalPages => (total / limit).ceil();
  bool get hasNextPage => page < totalPages;
}
